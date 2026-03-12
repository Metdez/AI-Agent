"""
Execution: PDF text extraction with vision-based fallback for image-based PDFs.
Uses PyMuPDF to render pages to images, then Claude Vision API to read them.
Vision fallback is capped at MAX_VISION_PAGES and runs in parallel batches.
"""

import os
import sys
import base64
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))


def extract_text_from_pdf(pdf_path: str) -> str:
    """
    Extract text from a PDF file. Falls back to Claude Vision if text extraction
    yields fewer than 100 characters (likely an image-based PDF).
    """
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    try:
        from pypdf import PdfReader
    except ImportError:
        raise ImportError("pypdf is required. Install with: pip install pypdf")

    try:
        reader = PdfReader(pdf_path)
        pages_text = []
        for page in reader.pages:
            text = page.extract_text()
            if text and text.strip():
                pages_text.append(text.strip())

        full_text = "\n\n".join(pages_text)

        if len(full_text) < 100:
            print("  -> Text extraction yielded < 100 chars, attempting vision fallback...")
            full_text = _vision_fallback(pdf_path)

        return full_text

    except Exception as e:
        raise Exception(f"Failed to read PDF '{pdf_path}': {e}")


def _vision_fallback(pdf_path: str) -> str:
    """
    Render PDF pages to images with PyMuPDF, then use Claude Vision to extract text.
    Capped at MAX_VISION_PAGES, processed in parallel batches of VISION_BATCH_SIZE.
    """
    try:
        import fitz  # PyMuPDF
    except ImportError:
        raise ImportError("pymupdf is required for image-based PDFs. Install with: pip install pymupdf")

    import anthropic
    from concurrent.futures import ThreadPoolExecutor, as_completed
    from config import ANTHROPIC_API_KEY, LLM_MODEL, MAX_VISION_PAGES, VISION_BATCH_SIZE
    from execution.api_helpers import retry_api_call

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    doc = fitz.open(pdf_path)

    # Cap pages
    total_pages = len(doc)
    pages_to_process = min(total_pages, MAX_VISION_PAGES)
    if total_pages > MAX_VISION_PAGES:
        print(f"  -> Capping vision fallback at {MAX_VISION_PAGES} pages (PDF has {total_pages})")

    # Pre-render all pages to base64 (fast, no API calls)
    page_images = []
    for i in range(pages_to_process):
        pix = doc[i].get_pixmap(dpi=200)
        img_bytes = pix.tobytes("png")
        img_b64 = base64.b64encode(img_bytes).decode("utf-8")
        page_images.append((i, img_b64))

    doc.close()

    # Process in parallel batches, preserving page order
    all_text = [""] * pages_to_process

    def _extract_page(page_idx, b64):
        def _do_extract():
            response = client.messages.create(
                model=LLM_MODEL,
                max_tokens=4096,
                messages=[{
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/png",
                                "data": b64,
                            },
                        },
                        {
                            "type": "text",
                            "text": "Extract ALL text from this pitch deck slide. Return only the text content, preserving structure. Include headers, bullet points, numbers, and any fine print.",
                        },
                    ],
                }],
            )
            return response.content[0].text
        return retry_api_call(_do_extract, label=f"Vision page {page_idx + 1}")

    for batch_start in range(0, len(page_images), VISION_BATCH_SIZE):
        batch = page_images[batch_start:batch_start + VISION_BATCH_SIZE]

        with ThreadPoolExecutor(max_workers=VISION_BATCH_SIZE) as executor:
            futures = {
                executor.submit(_extract_page, idx, b64): idx
                for idx, b64 in batch
            }
            for future in as_completed(futures):
                idx = futures[future]
                try:
                    text = future.result()
                    if text and text.strip():
                        all_text[idx] = text.strip()
                except Exception as e:
                    print(f"  -> Vision page {idx + 1} failed: {e}")
                print(f"  -> Vision page {idx + 1}/{pages_to_process} done")

    full_text = "\n\n".join(t for t in all_text if t)

    if len(full_text) < 100:
        raise ValueError(
            f"Vision extraction got only {len(full_text)} characters. "
            "PDF may be corrupted or contain no readable content."
        )

    return full_text


if __name__ == "__main__":
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).parent.parent))

    input_dir = Path(__file__).parent.parent / "input"
    pdfs = list(input_dir.glob("*.pdf"))

    if not pdfs:
        print("No PDF files found in input/. Drop a PDF there to test.")
    else:
        pdf = pdfs[0]
        print(f"Reading: {pdf.name}")
        text = extract_text_from_pdf(str(pdf))
        print(f"Length: {len(text)} characters")
        print(f"First 500 chars:\n{text[:500]}")
