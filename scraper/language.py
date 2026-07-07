"""Classify a showtime as OV, OmU or DE from its labels.

German cinemas mark original-language screenings in the show title or in
flag/attribute fields. Common markers:
  OV / OF / "Originalversion" / "Original Version"  -> original, no subtitles
  OmU / OmdU  -> original with German subtitles
  OmeU        -> original with English subtitles (we count it as OmU-like)
  nothing     -> German dubbed (DE)
"""
import re

OV_PATTERNS = [
    r"\bOV\b", r"\bOF\b", r"engl\.?\s*OF", r"original\s*(version|fassung)",
]
OMU_PATTERNS = [
    r"\bOmU\b", r"\bOmdU\b", r"\bOmeU\b", r"\bOmengU\b",
]


def classify(*texts: str) -> str:
    """Return 'OV', 'OmU' or 'DE' given any text fields describing the show."""
    blob = " ".join(t for t in texts if t)
    for pat in OMU_PATTERNS:
        if re.search(pat, blob, re.IGNORECASE):
            return "OmU"
    for pat in OV_PATTERNS:
        if re.search(pat, blob, re.IGNORECASE):
            return "OV"
    return "DE"


def clean_title(title: str) -> str:
    """Strip version markers so TMDB matching works on the bare title."""
    t = title
    t = re.sub(r"\((OV|OF|OmU|OmdU|OmeU|OmengU)\)", "", t, flags=re.IGNORECASE)
    t = re.sub(r"\b(engl\.?\s*)?(OV|OF|OmU|OmdU|OmeU)\b", "", t)
    t = re.sub(r"\b(3D|IMAX|4DX|Dolby Atmos)\b", "", t, flags=re.IGNORECASE)
    t = re.sub(r"[-–—]\s*(Director'?s Cut|Extended.*)$", "", t, flags=re.IGNORECASE)
    return re.sub(r"\s{2,}", " ", t).strip(" -–—:")
