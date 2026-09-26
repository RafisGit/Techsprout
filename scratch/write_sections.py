import os
import sys

# Add scratch dir to path
sys.path.append(os.path.abspath("scratch"))

import part1
import part2
import part3
import part4
import part5

def assemble():
    html_file = os.path.abspath("scratch/report.html")
    print(f"Assembling report components into {html_file}...")
    
    with open(html_file, "a", encoding="utf-8") as f:
        f.write(part1.get_part1_html())
        f.write(part2.get_part2_html())
        f.write(part3.get_part3_html())
        f.write(part4.get_part4_html())
        f.write(part5.get_part5_html())

    print("All parts successfully written to HTML report.")

if __name__ == "__main__":
    assemble()
