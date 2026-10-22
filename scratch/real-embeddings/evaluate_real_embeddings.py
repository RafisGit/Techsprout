# scratch/real-embeddings/evaluate_real_embeddings.py
import json
import math
import os
import time
import ctypes
from ctypes import wintypes
import numpy as np
from fastembed import TextEmbedding

class PROCESS_MEMORY_COUNTERS(ctypes.Structure):
    _fields_ = [
        ('cb', wintypes.DWORD),
        ('PageFaultCount', wintypes.DWORD),
        ('PeakWorkingSetSize', ctypes.c_size_t),
        ('WorkingSetSize', ctypes.c_size_t),
        ('QuotaPeakPagedPoolUsage', ctypes.c_size_t),
        ('QuotaPagedPoolUsage', ctypes.c_size_t),
        ('QuotaPeakNonPagedPoolUsage', ctypes.c_size_t),
        ('QuotaNonPagedPoolUsage', ctypes.c_size_t),
        ('PagefileUsage', ctypes.c_size_t),
        ('PeakPagefileUsage', ctypes.c_size_t),
    ]

psapi = ctypes.windll.psapi
psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(PROCESS_MEMORY_COUNTERS), wintypes.DWORD]
psapi.GetProcessMemoryInfo.restype = wintypes.BOOL
k32 = ctypes.windll.kernel32
k32.GetCurrentProcess.restype = wintypes.HANDLE

def get_process_rss_mb():
    counters = PROCESS_MEMORY_COUNTERS()
    counters.cb = ctypes.sizeof(PROCESS_MEMORY_COUNTERS)
    res = psapi.GetProcessMemoryInfo(
        k32.GetCurrentProcess(),
        ctypes.byref(counters),
        counters.cb
    )
    if not res:
        return 0.0
    return counters.WorkingSetSize / (1024 * 1024)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE_DIR, "benchmark_data.json")

with open(DATA_PATH, "r", encoding="utf-8") as f:
    data = json.load(f)

lessons = data["lessons"]
chunks = data["chunks"]
queries = data["queries"]

print(f"Loaded {len(lessons)} lessons, {len(chunks)} chunks, and {len(queries)} queries.")

# ============================================================================
# METRICS HELPERS
# ============================================================================

def calculate_dcg(relevance_scores, k=5):
    dcg = 0.0
    for i in range(min(k, len(relevance_scores))):
        rel = relevance_scores[i]
        dcg += (math.pow(2, rel) - 1.0) / math.log2(i + 2)
    return dcg

def calculate_idcg(ideal_relevance_scores, k=5):
    sorted_ideal = sorted(ideal_relevance_scores, reverse=True)
    return calculate_dcg(sorted_ideal, k)

def evaluate_retrieval(retrieved_lesson_ids, relevant_map, k=5):
    retrieved_rel = [relevant_map.get(str(lid), relevant_map.get(lid, 0)) for lid in retrieved_lesson_ids[:k]]
    ideal_rel = [g for g in relevant_map.values() if g > 0]

    dcg = calculate_dcg(retrieved_rel, k)
    idcg = calculate_idcg(ideal_rel, k)
    ndcg = (dcg / idcg) if idcg > 0 else 0.0

    retrieved_relevant_count = sum(1 for lid in retrieved_lesson_ids[:k] if relevant_map.get(str(lid), relevant_map.get(lid, 0)) >= 1)
    recall = (retrieved_relevant_count / len(ideal_rel)) if ideal_rel else 0.0

    return ndcg, recall, len(retrieved_lesson_ids)

# ============================================================================
# BENCHMARK EVALUATOR FUNCTION
# ============================================================================

def run_model_benchmark(model_name, display_name):
    print(f"\n{'='*80}")
    print(f"EVALUATING MODEL: {display_name} ({model_name})")
    print(f"{'='*80}")

    mem_before = get_process_rss_mb()

    t0_load = time.perf_counter()
    model = TextEmbedding(model_name=model_name)
    load_time_ms = (time.perf_counter() - t0_load) * 1000

    mem_after = get_process_rss_mb()
    model_ram_mb = mem_after - mem_before

    print(f"Model Load Time: {load_time_ms:.2f} ms")
    print(f"Memory RSS (Before): {mem_before:.2f} MB | (After): {mem_after:.2f} MB | Net Model RAM: {model_ram_mb:.2f} MB")

    # 1. Encode all chunks/lessons
    chunk_texts = [f"Lesson: {c['lessonTitle']}. Module: {c['moduleTitle']}. {c['content']}" for c in chunks]
    print(f"Encoding {len(chunk_texts)} corpus passages...")
    t0_doc_enc = time.perf_counter()
    chunk_embeddings = np.array(list(model.embed(chunk_texts)))
    doc_enc_time_ms = (time.perf_counter() - t0_doc_enc) * 1000
    avg_doc_enc_ms = doc_enc_time_ms / len(chunk_texts)
    dim = chunk_embeddings.shape[1]
    print(f"Corpus Encoded: shape = {chunk_embeddings.shape}, dim = {dim}, total time = {doc_enc_time_ms:.2f} ms (avg {avg_doc_enc_ms:.2f} ms/doc)")

    # 2. Measure Query Embedding Latency
    query_texts = [q["query"] for q in queries]
    query_embeddings = []
    query_latencies = []

    # Cold cache vs warm cache measurement
    cold_query = query_texts[0]
    t0_cold = time.perf_counter()
    cold_emb = list(model.embed([cold_query]))[0]
    cold_ms = (time.perf_counter() - t0_cold) * 1000

    # Embed all queries sequentially to measure distribution
    for q_text in query_texts:
        t0_q = time.perf_counter()
        q_emb = list(model.embed([q_text]))[0]
        q_lat = (time.perf_counter() - t0_q) * 1000
        query_latencies.append(q_lat)
        query_embeddings.append(q_emb)

    query_embeddings = np.array(query_embeddings)
    sorted_q_lat = sorted(query_latencies)
    p50_q_lat = sorted_q_lat[int(len(sorted_q_lat) * 0.5)]
    p95_q_lat = sorted_q_lat[int(len(sorted_q_lat) * 0.95)]
    mean_q_lat = sum(sorted_q_lat) / len(sorted_q_lat)

    print(f"\nQuery Embedding Latency (Local Machine Inference):")
    print(f"  Cold Query Latency: {cold_ms:.2f} ms")
    print(f"  Warm Query Latency: mean = {mean_q_lat:.2f} ms, p50 = {p50_q_lat:.2f} ms, p95 = {p95_q_lat:.2f} ms")

    # 3. Vector Similarity Retrieval
    # chunk_embeddings are normalized to unit L2 norm, so cosine similarity is dot product
    # Shape: (32, 100)
    all_sims = np.dot(query_embeddings, chunk_embeddings.T)

    # For each query, get ranked list of lesson IDs
    vector_rankings = []
    for q_idx in range(len(queries)):
        sims = all_sims[q_idx]
        # Map chunks to lessons with deduplication
        scored = []
        seen = set()
        for c_idx in np.argsort(-sims):
            lid = chunks[c_idx]["lessonId"]
            if lid not in seen:
                seen.add(lid)
                scored.append((lid, float(sims[c_idx])))
        vector_rankings.append(scored)

    # 4. Extract Authoritative BM25 rankings
    bm25_rankings = []
    for q in queries:
        citations = q["bm25Citations"]
        scored = [(c["lessonId"], float(c["score"])) for c in citations]
        bm25_rankings.append(scored)

    # =========================================================================
    # EVALUATION SUITE
    # =========================================================================
    tuning_indices = [i for i in range(len(queries)) if i % 2 == 0]
    val_indices = [i for i in range(len(queries)) if i % 2 == 1]

    def eval_suite(ranking_list, desc=""):
        ndcgs, recalls, drops = [], [], 0
        cat_stats = {}

        for i, q in enumerate(queries):
            ranked_lids = [r[0] for r in ranking_list[i]]
            ndcg, recall, count = evaluate_retrieval(ranked_lids, q["relevant"], k=5)
            ndcgs.append(ndcg)
            recalls.append(recall)
            if count == 0:
                drops += 1

            cat = q["category"]
            if cat not in cat_stats:
                cat_stats[cat] = {"ndcg": [], "recall": []}
            cat_stats[cat]["ndcg"].append(ndcg)
            cat_stats[cat]["recall"].append(recall)

        overall_ndcg = np.mean(ndcgs)
        overall_recall = np.mean(recalls)
        tune_ndcg = np.mean([ndcgs[i] for i in tuning_indices])
        tune_recall = np.mean([recalls[i] for i in tuning_indices])
        val_ndcg = np.mean([ndcgs[i] for i in val_indices])
        val_recall = np.mean([recalls[i] for i in val_indices])

        return {
            "overall_ndcg": overall_ndcg,
            "overall_recall": overall_recall,
            "tune_ndcg": tune_ndcg,
            "tune_recall": tune_recall,
            "val_ndcg": val_ndcg,
            "val_recall": val_recall,
            "drops": drops,
            "cat_stats": cat_stats
        }

    # Config 1: BM25 Baseline
    res_bm25 = eval_suite(bm25_rankings, "1. Authoritative BM25 Baseline")

    # Config 2: Dense Vector Alone
    res_vec = eval_suite(vector_rankings, "2. Dense Vector Retrieval Alone")

    # Config 3: RRF Tuning & Freezing
    # Tune k on tuning subset
    best_rrf_k = 60
    best_rrf_tune_score = -1.0
    rrf_tuning_results = {}

    for k_val in [10, 20, 30, 40, 50, 60, 80, 100]:
        fused_rankings = []
        for q_idx in range(len(queries)):
            b_list = [x[0] for x in bm25_rankings[q_idx]]
            v_list = [x[0] for x in vector_rankings[q_idx]]
            rrf_map = {}
            for rank, lid in enumerate(b_list):
                rrf_map[lid] = rrf_map.get(lid, 0.0) + 1.0 / (k_val + rank + 1)
            for rank, lid in enumerate(v_list):
                rrf_map[lid] = rrf_map.get(lid, 0.0) + 1.0 / (k_val + rank + 1)
            scored = sorted(rrf_map.items(), key=lambda x: x[1], reverse=True)
            fused_rankings.append(scored)

        t_res = eval_suite(fused_rankings)
        rrf_tuning_results[k_val] = t_res
        if t_res["tune_recall"] > best_rrf_tune_score:
            best_rrf_tune_score = t_res["tune_recall"]
            best_rrf_k = k_val

    # Freeze optimal RRF k
    fused_rrf_rankings = []
    for q_idx in range(len(queries)):
        b_list = [x[0] for x in bm25_rankings[q_idx]]
        v_list = [x[0] for x in vector_rankings[q_idx]]
        rrf_map = {}
        for rank, lid in enumerate(b_list):
            rrf_map[lid] = rrf_map.get(lid, 0.0) + 1.0 / (best_rrf_k + rank + 1)
        for rank, lid in enumerate(v_list):
            rrf_map[lid] = rrf_map.get(lid, 0.0) + 1.0 / (best_rrf_k + rank + 1)
        scored = sorted(rrf_map.items(), key=lambda x: x[1], reverse=True)
        fused_rrf_rankings.append(scored)
    res_rrf = eval_suite(fused_rrf_rankings, f"3. BM25 + Vector RRF (k={best_rrf_k})")

    # Config 4: Linear Fusion Tuning & Freezing
    best_linear_alpha = 0.7
    best_linear_tune_score = -1.0
    linear_tuning_results = {}

    for alpha in [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]:
        fused_rankings = []
        for q_idx in range(len(queries)):
            b_dict = {x[0]: x[1] for x in bm25_rankings[q_idx]}
            v_dict = {x[0]: x[1] for x in vector_rankings[q_idx]}
            all_lids = set(b_dict.keys()) | set(v_dict.keys())
            fused = []
            for lid in all_lids:
                bm_s = b_dict.get(lid, 0.0)
                # BM25 monotonic normalization
                norm_bm = (bm_s / (bm_s + 2.5)) if bm_s > 0 else 0.0
                vec_s = max(0.0, min(1.0, v_dict.get(lid, 0.0)))
                combo = alpha * norm_bm + (1.0 - alpha) * vec_s
                fused.append((lid, combo))
            fused.sort(key=lambda x: x[1], reverse=True)
            fused_rankings.append(fused)

        t_res = eval_suite(fused_rankings)
        linear_tuning_results[alpha] = t_res
        if t_res["tune_recall"] > best_linear_tune_score:
            best_linear_tune_score = t_res["tune_recall"]
            best_linear_alpha = alpha

    # Freeze optimal Linear alpha
    fused_linear_rankings = []
    for q_idx in range(len(queries)):
        b_dict = {x[0]: x[1] for x in bm25_rankings[q_idx]}
        v_dict = {x[0]: x[1] for x in vector_rankings[q_idx]}
        all_lids = set(b_dict.keys()) | set(v_dict.keys())
        fused = []
        for lid in all_lids:
            bm_s = b_dict.get(lid, 0.0)
            norm_bm = (bm_s / (bm_s + 2.5)) if bm_s > 0 else 0.0
            vec_s = max(0.0, min(1.0, v_dict.get(lid, 0.0)))
            combo = best_linear_alpha * norm_bm + (1.0 - best_linear_alpha) * vec_s
            fused.append((lid, combo))
        fused.sort(key=lambda x: x[1], reverse=True)
        fused_linear_rankings.append(fused)
    res_linear = eval_suite(fused_linear_rankings, f"4. BM25 + Vector Linear (alpha={best_linear_alpha})")

    # PRINT SUMMARY TABLE
    print(f"\n--- RESULTS SUMMARY: {display_name} ---")
    print(f"{'CONFIGURATION':<35} | {'FULL NDCG':<9} | {'FULL REC':<9} | {'TUNE NDCG':<9} | {'TUNE REC':<9} | {'VAL NDCG':<9} | {'VAL REC':<9} | {'DROPS':<5}")
    print("-" * 115)

    def print_row(name, r):
        print(f"{name:<35} | {r['overall_ndcg']:<9.4f} | {r['overall_recall']:<9.4f} | {r['tune_ndcg']:<9.4f} | {r['tune_recall']:<9.4f} | {r['val_ndcg']:<9.4f} | {r['val_recall']:<9.4f} | {r['drops']:<5}")

    print_row("1. Authoritative BM25 Baseline", res_bm25)
    print_row("2. Dense Vector Only", res_vec)
    print_row(f"3. Hybrid RRF (k={best_rrf_k} frozen)", res_rrf)
    print_row(f"4. Hybrid Linear (alpha={best_linear_alpha} frozen)", res_linear)

    print("\nRRF Parameter Sweep on Tuning Set:")
    for k_val, r in rrf_tuning_results.items():
        mark = " (SELECTED)" if k_val == best_rrf_k else ""
        print(f"  k={k_val:<3}: Tune Recall={r['tune_recall']:.4f}, Tune NDCG={r['tune_ndcg']:.4f} | Val Recall={r['val_recall']:.4f}, Val NDCG={r['val_ndcg']:.4f}{mark}")

    print("\nLinear Alpha Parameter Sweep on Tuning Set:")
    for alpha, r in linear_tuning_results.items():
        mark = " (SELECTED)" if alpha == best_linear_alpha else ""
        print(f"  alpha={alpha:.1f}: Tune Recall={r['tune_recall']:.4f}, Tune NDCG={r['tune_ndcg']:.4f} | Val Recall={r['val_recall']:.4f}, Val NDCG={r['val_ndcg']:.4f}{mark}")

    print("\nPer-Category Breakdown for Hybrid RRF:")
    for cat, stats in res_rrf["cat_stats"].items():
        print(f"  {cat:<22}: NDCG@5 = {np.mean(stats['ndcg']):.4f}, Recall@5 = {np.mean(stats['recall']):.4f}")

    return {
        "model_name": model_name,
        "display_name": display_name,
        "dim": dim,
        "model_ram_mb": model_ram_mb,
        "load_time_ms": load_time_ms,
        "cold_q_ms": cold_ms,
        "p50_q_ms": p50_q_lat,
        "p95_q_ms": p95_q_lat,
        "bm25": res_bm25,
        "vector_only": res_vec,
        "rrf": res_rrf,
        "linear": res_linear,
        "best_rrf_k": best_rrf_k,
        "best_linear_alpha": best_linear_alpha
    }

# Run Benchmark on candidate 1: all-MiniLM-L6-v2
results_minilm = run_model_benchmark("sentence-transformers/all-MiniLM-L6-v2", "MiniLM-L6-v2")

# Run Benchmark on candidate 2: BAAI/bge-small-en-v1.5
results_bge = run_model_benchmark("BAAI/bge-small-en-v1.5", "BGE-Small-en-v1.5")

# Save complete JSON results
out_res_path = os.path.join(BASE_DIR, "real_embedding_benchmark_results.json")
def sanitize(obj):
    if isinstance(obj, (np.floating, float)):
        return float(obj)
    if isinstance(obj, (np.integer, int)):
        return int(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, dict):
        return {k: sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize(v) for v in obj]
    return obj

with open(out_res_path, "w", encoding="utf-8") as f:
    json.dump(sanitize({"minilm": results_minilm, "bge": results_bge}), f, indent=2)

print(f"\nSaved benchmark results to {out_res_path}")
