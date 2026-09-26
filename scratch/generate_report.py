import os
import subprocess
import sys

def build_report():
    print("Building TechSprout School LMS Product Research & Development Guideline...")
    
    # We will assemble HTML in parts to maintain clarity and structure.
    html_file = os.path.abspath("scratch/report.html")
    pdf_file_root = os.path.abspath("TECHSPROUT_SCHOOL_LMS_PRODUCT_RESEARCH_AND_DEVELOPMENT_GUIDELINE.pdf")
    pdf_file_artifact = os.path.abspath(r"C:\Users\hrafi\.gemini\antigravity\brain\6651a2a6-30f8-4c3a-9fee-2faa57187b11\TECHSPROUT_SCHOOL_LMS_PRODUCT_RESEARCH_AND_DEVELOPMENT_GUIDELINE.pdf")

    # Let's write out the HTML document
    with open(html_file, "w", encoding="utf-8") as f:
        # Header and CSS
        f.write('''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>TechSprout School LMS - Product Research & Development Guideline</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Hind+Siliguri:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');

  @page {
    size: A4;
    margin: 20mm 16mm 20mm 16mm;
    @bottom-right {
      content: counter(page);
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 8pt;
      color: #64748B;
    }
    @bottom-left {
      content: "TechSprout School LMS — Product Research & Engineering Guideline";
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 8pt;
      color: #64748B;
    }
  }

  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  body {
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 10pt;
    line-height: 1.55;
    color: #1E293B;
    background: #FFFFFF;
    margin: 0;
    padding: 0;
  }

  .bangla-text {
    font-family: 'Hind Siliguri', 'Plus Jakarta Sans', sans-serif;
  }

  .page-break {
    page-break-after: always;
    break-after: page;
  }

  .avoid-break {
    page-break-inside: avoid;
    break-inside: avoid;
  }

  /* Cover Page */
  .cover-page {
    height: 100vh;
    min-height: 270mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 30mm 10mm 15mm 10mm;
    background: linear-gradient(135deg, #091E3A 0%, #102A45 50%, #0F3B4C 100%);
    color: #FFFFFF;
    border-radius: 8px;
    position: relative;
    overflow: hidden;
  }

  .cover-badge {
    display: inline-block;
    background: rgba(16, 185, 129, 0.2);
    color: #34D399;
    border: 1px solid rgba(52, 211, 153, 0.4);
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 9pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    margin-bottom: 20px;
  }

  .cover-title {
    font-size: 32pt;
    font-weight: 800;
    line-height: 1.15;
    margin: 0 0 16px 0;
    letter-spacing: -0.5px;
    color: #FFFFFF;
  }

  .cover-subtitle {
    font-size: 13pt;
    font-weight: 400;
    line-height: 1.6;
    color: #94A3B8;
    max-width: 90%;
    margin-bottom: 40px;
  }

  .cover-divider {
    width: 80px;
    height: 4px;
    background: #10B981;
    border-radius: 2px;
    margin-bottom: 30px;
  }

  .cover-roles {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 16px 20px;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    margin-bottom: 40px;
  }

  .cover-role-item {
    font-size: 8.5pt;
    color: #CBD5E1;
  }

  .cover-role-item strong {
    color: #38BDF8;
  }

  .cover-meta {
    border-top: 1px solid rgba(255, 255, 255, 0.15);
    padding-top: 20px;
    display: flex;
    justify-content: space-between;
    font-size: 9pt;
    color: #94A3B8;
  }

  /* Typography */
  h1 {
    font-size: 20pt;
    font-weight: 800;
    color: #0F172A;
    margin-top: 28pt;
    margin-bottom: 12pt;
    border-bottom: 2px solid #E2E8F0;
    padding-bottom: 6pt;
    letter-spacing: -0.3px;
  }

  h1.section-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  h1 .num {
    background: #0284C7;
    color: #FFFFFF;
    font-size: 11pt;
    font-weight: 700;
    padding: 3px 9px;
    border-radius: 6px;
    display: inline-block;
  }

  h2 {
    font-size: 13.5pt;
    font-weight: 700;
    color: #1E293B;
    margin-top: 18pt;
    margin-bottom: 8pt;
    border-left: 3.5px solid #0284C7;
    padding-left: 8px;
  }

  h3 {
    font-size: 11pt;
    font-weight: 600;
    color: #334155;
    margin-top: 14pt;
    margin-bottom: 6pt;
  }

  p {
    margin: 0 0 8pt 0;
    text-align: justify;
  }

  /* Executive Decision Summary Box */
  .eds-container {
    background: #F8FAFC;
    border: 2px solid #0284C7;
    border-radius: 8px;
    padding: 16px 20px;
    margin-bottom: 20px;
  }

  .eds-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid #CBD5E1;
    padding-bottom: 8px;
    margin-bottom: 14px;
  }

  .eds-title {
    font-size: 14pt;
    font-weight: 800;
    color: #0369A1;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0;
  }

  .eds-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px 18px;
  }

  .eds-item {
    font-size: 8.8pt;
    line-height: 1.45;
  }

  .eds-item strong {
    color: #0F172A;
    display: block;
    margin-bottom: 2px;
    font-size: 9pt;
  }

  /* Callout Boxes */
  .callout {
    border-radius: 6px;
    padding: 10px 14px;
    margin: 12pt 0;
    font-size: 9.2pt;
    line-height: 1.5;
  }

  .callout-critical {
    background: #FEF2F2;
    border-left: 4px solid #EF4444;
    color: #991B1B;
  }

  .callout-warning {
    background: #FFFBEB;
    border-left: 4px solid #F59E0B;
    color: #92400E;
  }

  .callout-info {
    background: #F0F9FF;
    border-left: 4px solid #0284C7;
    color: #075985;
  }

  .callout-success {
    background: #ECFDF5;
    border-left: 4px solid #10B981;
    color: #065F46;
  }

  .callout-title {
    font-weight: 700;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  /* Tables */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 10pt 0;
    font-size: 8.5pt;
  }

  th, td {
    padding: 6pt 8pt;
    text-align: left;
    vertical-align: top;
    border: 1px solid #CBD5E1;
  }

  th {
    background: #F1F5F9;
    color: #0F172A;
    font-weight: 700;
    font-size: 8.5pt;
  }

  tr:nth-child(even) td {
    background: #F8FAFC;
  }

  /* Badges */
  .badge {
    display: inline-block;
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 7.2pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    white-space: nowrap;
  }

  .badge-critical { background: #FEE2E2; color: #991B1B; border: 1px solid #FCA5A5; }
  .badge-high { background: #FFEDD5; color: #9A3412; border: 1px solid #FDBA74; }
  .badge-medium { background: #FEF3C7; color: #92400E; border: 1px solid #FCD34D; }
  .badge-low { background: #E0E7FF; color: #3730A3; border: 1px solid #A5B4FC; }
  .badge-mvp { background: #DCFCE7; color: #166534; border: 1px solid #86EFAC; }
  .badge-postmvp { background: #E0F2FE; color: #075985; border: 1px solid #7DD3FC; }
  .badge-future { background: #F3E8FF; color: #6B21A8; border: 1px solid #D8B4FE; }

  .status-tag {
    font-weight: 700;
    font-size: 7.5pt;
    padding: 2px 6px;
    border-radius: 3px;
  }
  .status-complete { background: #D1FAE5; color: #065F46; }
  .status-mock { background: #FEF3C7; color: #92400E; }
  .status-broken { background: #FEE2E2; color: #991B1B; }
  .status-missing { background: #F1F5F9; color: #475569; }
  .status-partial { background: #E0E7FF; color: #3730A3; }

  /* Code & Pre */
  code {
    font-family: 'JetBrains Mono', Consolas, monospace;
    font-size: 8pt;
    background: #F1F5F9;
    padding: 1.5px 4px;
    border-radius: 3px;
    color: #0F172A;
  }

  pre {
    background: #0F172A;
    color: #F8FAFC;
    padding: 10px 14px;
    border-radius: 6px;
    font-family: 'JetBrains Mono', Consolas, monospace;
    font-size: 7.8pt;
    line-height: 1.45;
    overflow-x: auto;
    margin: 8pt 0;
  }

  pre code {
    background: transparent;
    color: inherit;
    padding: 0;
  }

  /* TOC */
  .toc-container {
    padding: 10px 0;
  }
  .toc-item {
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
    border-bottom: 1px dotted #CBD5E1;
    font-size: 8.8pt;
  }
  .toc-item a {
    color: #1E293B;
    text-decoration: none;
    font-weight: 500;
  }
  .toc-item span.page-num {
    color: #64748B;
    font-weight: 600;
  }

  /* Diagram Blocks */
  .diagram-box {
    background: #F8FAFC;
    border: 1px solid #CBD5E1;
    border-radius: 6px;
    padding: 12px;
    margin: 10pt 0;
    font-family: 'JetBrains Mono', monospace;
    font-size: 8pt;
    line-height: 1.4;
    color: #334155;
  }

  /* Checklists */
  .check-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 4px;
    font-size: 8.8pt;
  }
  .check-box {
    font-family: monospace;
    font-weight: bold;
    color: #0284C7;
  }
</style>
</head>
<body>
''')
        
    print("Writing sections...")
    # Now execute modular builder scripts or append sections
    subprocess.run([sys.executable, "scratch/write_sections.py"], check=True)
    
    print("Compiling PDF via Headless Chrome...")
    # Run Chrome Headless to generate PDF
    chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    
    cmd = [
        "powershell",
        "-Command",
        f'Start-Process -FilePath "{chrome_path}" -ArgumentList "--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--print-to-pdf={pdf_file_root}", "file:///{html_file.replace(os.sep, "/")}" -Wait'
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    print("Chrome stdout:", res.stdout)
    print("Chrome stderr:", res.stderr)
    
    if os.path.exists(pdf_file_root):
        print(f"Generated root PDF successfully: {pdf_file_root} ({os.path.getsize(pdf_file_root)} bytes)")
        # Copy to artifact dir
        import shutil
        shutil.copyfile(pdf_file_root, pdf_file_artifact)
        print(f"Copied to artifact directory: {pdf_file_artifact}")
    else:
        print("ERROR: PDF was not generated.")

if __name__ == "__main__":
    build_report()
