"""
Execution: PDF text extraction with OCR fallback for image-based PDFs.
"""

import os


def extract_text_from_pdf(pdf_path: str) -> str:
    """
    Extract text from a PDF file. Falls back to OCR if text extraction
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
            print("  -> Text extraction yielded < 100 chars, attempting OCR fallback...")
            full_text = _ocr_fallback(pdf_path)

        return full_text

    except Exception as e:
        raise Exception(f"Failed to read PDF '{pdf_path}': {e}")


def _ocr_fallback(pdf_path: str) -> str:
    """Convert PDF pages to images and OCR them."""
    try:
        from pdf2image import convert_from_path
    except ImportError:
        raise ValueError(
            "PDF appears image-based. Install pdf2image and poppler for OCR support. "
            "pip install pdf2image, then install poppler: https://github.com/oschwartz10612/poppler-windows/releases"
        )

    try:
        import pytesseract
    except ImportError:
        raise ValueError(
            "PDF appears image-based. Install pytesseract and poppler for OCR support. "
            "pip install pytesseract, then install Tesseract: https://github.com/tesseract-ocr/tesseract"
        )

    try:
        images = convert_from_path(pdf_path)
        ocr_pages = []
        for i, image in enumerate(images):
            text = pytesseract.image_to_string(image)
            if text and text.strip():
                ocr_pages.append(text.strip())
            print(f"  -> OCR page {i + 1}/{len(images)} done")

        full_text = "\n\n".join(ocr_pages)

        if len(full_text) < 100:
            raise ValueError(
                f"OCR extracted only {len(full_text)} characters. "
                "PDF may be corrupted or contain no readable content."
            )

        return full_text

    except (ValueError, ImportError):
        raise
    except Exception as e:
        raise Exception(f"OCR fallback failed for '{pdf_path}': {e}")


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
