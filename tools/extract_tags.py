#!/usr/bin/env python
"""
extract_tags.py - Extract drawing tags from construction plan PDFs

Scans a PDF for tags matching the pattern XX/ACYYY (e.g., 01/AC501, 03/AC602)
and outputs an index.json file with all occurrences including page numbers,
text snippets, and bounding boxes.

Usage:
    python extract_tags.py <pdf_file> [--output <output_file>]

Example:
    python extract_tags.py "2024_05_24 90_ CD Set.pdf"
"""

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List

try:
    import fitz  # PyMuPDF
except ImportError:
    print("Error: PyMuPDF (fitz) not installed. Run: pip install PyMuPDF")
    sys.exit(1)


# Pattern to match tags like 01/AC501, 03/AC602, etc.
# Format: 2 digits, slash, letters, digits
TAG_PATTERN = re.compile(r'\b(\d{2}/[A-Z]{2}\d{3,4})\b', re.IGNORECASE)


def extract_tags_from_pdf(pdf_path: str) -> Dict[str, Any]:
    """
    Extract all tag occurrences from the PDF.
    
    Args:
        pdf_path: Path to the PDF file
        
    Returns:
        Dictionary with tag index data
    """
    pdf_path = Path(pdf_path)
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF file not found: {pdf_path}")
    
    doc = fitz.open(pdf_path)
    num_pages = len(doc)
    tag_occurrences = {}
    all_tags = set()

    print(f"Scanning {num_pages} pages in '{pdf_path.name}'...")
    
    for page_num in range(num_pages):
        page = doc[page_num]
        text = page.get_text("text")
        
        # Find all tag matches in the page text
        matches = TAG_PATTERN.finditer(text)
        
        for match in matches:
            tag = match.group(1).upper()
            all_tags.add(tag)
            
            # Search for the text on the page to get bounding boxes
            text_instances = page.search_for(match.group(0))
            
            for rect in text_instances:
                # Get surrounding context (snippet)
                snippet = extract_snippet(text, match.start(), match.end())
                
                occurrence = {
                    "page": page_num + 1,  # 1-indexed for user display
                    "snippet": snippet,
                    "bbox": {
                        "x0": round(rect.x0, 2),
                        "y0": round(rect.y0, 2),
                        "x1": round(rect.x1, 2),
                        "y1": round(rect.y1, 2)
                    }
                }
                
                if tag not in tag_occurrences:
                    tag_occurrences[tag] = []
                
                tag_occurrences[tag].append(occurrence)
    
    doc.close()

    # Build the index structure
    index = {
        "pdf_file": pdf_path.name,
        "total_pages": num_pages,
        "total_tags": len(all_tags),
        "tags": tag_occurrences
    }
    
    print(f"Found {len(all_tags)} unique tags with {sum(len(v) for v in tag_occurrences.values())} total occurrences")
    
    return index


def extract_snippet(text: str, start: int, end: int, context_chars: int = 50) -> str:
    """
    Extract a text snippet around the matched tag.
    
    Args:
        text: Full text content
        start: Start position of match
        end: End position of match
        context_chars: Number of characters to include before and after
        
    Returns:
        Text snippet with context
    """
    snippet_start = max(0, start - context_chars)
    snippet_end = min(len(text), end + context_chars)
    
    snippet = text[snippet_start:snippet_end].strip()
    
    # Clean up whitespace
    snippet = ' '.join(snippet.split())
    
    # Add ellipsis if truncated
    if snippet_start > 0:
        snippet = "..." + snippet
    if snippet_end < len(text):
        snippet = snippet + "..."
    
    return snippet


def save_index(index: Dict[str, Any], output_path: Path) -> None:
    """
    Save the index to a JSON file.
    
    Args:
        index: Tag index data
        output_path: Path to output JSON file
    """
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(index, f, indent=2, ensure_ascii=False)
    
    print(f"Index saved to: {output_path}")


def main():
    parser = argparse.ArgumentParser(
        description='Extract drawing tags from construction plan PDFs'
    )
    parser.add_argument(
        'pdf_file',
        help='Path to the PDF file to process'
    )
    parser.add_argument(
        '--output', '-o',
        default='index.json',
        help='Output JSON file path (default: index.json)'
    )
    
    args = parser.parse_args()
    
    try:
        # Extract tags
        index = extract_tags_from_pdf(args.pdf_file)
        
        # Save to JSON
        output_path = Path(args.output)
        save_index(index, output_path)
        
        print("\nExtraction complete!")
        print(f"  Tags found: {index['total_tags']}")
        print(f"  Total occurrences: {sum(len(v) for v in index['tags'].values())}")
        print(f"  Output: {output_path.absolute()}")
        
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
