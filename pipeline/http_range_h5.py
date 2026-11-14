"""
HTTP 206 Range Request File Wrapper for Cloud-Optimized NISAR HDF5 (.h5) Streaming.

Streams only the necessary 512x512 HDF5 spatial chunks and B-tree headers (~2-5 MB)
from NASA Earthdata Cloud (ASF) without downloading full 4-9 GB .h5 granules.
"""

import io
import os
from pathlib import Path
import asf_search as asf
from dotenv import load_dotenv


def create_asf_session(env_path=None):
    """Authenticate an ASFSession using NASA_USER and NASA_PASS from project .env."""
    if env_path and Path(env_path).exists():
        load_dotenv(env_path, override=True)
    else:
        project_env = Path(__file__).resolve().parents[1] / ".env"
        if project_env.exists():
            load_dotenv(project_env, override=True)
        else:
            load_dotenv(override=True)

    username = os.getenv("NASA_USER")
    password = os.getenv("NASA_PASS")
    session = asf.ASFSession()
    if username and password:
        session.auth_with_creds(username, password)
    return session


class HTTPRangeFile(io.RawIOBase):
    """
    Seekable read-only file-like object backed by HTTP 206 Range Requests
    with in-memory page caching for fast h5py B-tree and chunk access.
    """

    def __init__(self, url: str, session=None, page_size: int = 1024 * 1024):
        super().__init__()
        self.url = url
        self.session = session or create_asf_session()
        self.page_size = page_size
        self.pos = 0
        self.bytes_downloaded = 0
        self.requests_count = 0
        self._pages = {}
        self.size = self._probe_size()

    def _probe_size(self) -> int:
        resp = self.session.get(
            self.url,
            headers={"Range": "bytes=0-0"},
            stream=True,
            timeout=30,
        )
        resp.raise_for_status()
        # Update URL to final redirect target so subsequent Range requests avoid redirect round-trips
        if resp.url:
            self.url = resp.url
        content_range = resp.headers.get("Content-Range", "")
        if "/" in content_range:
            return int(content_range.split("/")[-1])
        return int(resp.headers.get("Content-Length", 0))

    def readable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return True

    def writable(self) -> bool:
        return False

    def seek(self, offset: int, whence: int = io.SEEK_SET) -> int:
        if whence == io.SEEK_SET:
            self.pos = offset
        elif whence == io.SEEK_CUR:
            self.pos += offset
        elif whence == io.SEEK_END:
            self.pos = self.size + offset
        else:
            raise ValueError(f"Unsupported whence: {whence}")
        self.pos = max(0, min(self.pos, self.size))
        return self.pos

    def tell(self) -> int:
        return self.pos

    def _fetch_range(self, start: int, end_inclusive: int) -> bytes:
        end_inclusive = min(end_inclusive, self.size - 1)
        if start > end_inclusive:
            return b""
        resp = self.session.get(
            self.url,
            headers={"Range": f"bytes={start}-{end_inclusive}"},
            timeout=45,
        )
        resp.raise_for_status()
        data = resp.content
        self.bytes_downloaded += len(data)
        self.requests_count += 1
        return data

    def _get_page(self, page_idx: int) -> bytes:
        if page_idx not in self._pages:
            start = page_idx * self.page_size
            end = start + self.page_size - 1
            self._pages[page_idx] = self._fetch_range(start, end)
        return self._pages[page_idx]

    def readinto(self, b) -> int:
        mv = memoryview(b).cast("B")
        n = len(mv)
        if n == 0 or self.pos >= self.size:
            return 0

        end_pos = min(self.pos + n, self.size)
        total_to_read = end_pos - self.pos

        start_page = self.pos // self.page_size
        end_page = (end_pos - 1) // self.page_size

        # If a single large read spans multiple uncached pages, fetch contiguously
        if end_page - start_page >= 2 and any(p not in self._pages for p in range(start_page, end_page + 1)):
            raw = self._fetch_range(start_page * self.page_size, (end_page + 1) * self.page_size - 1)
            for p in range(start_page, end_page + 1):
                offset = (p - start_page) * self.page_size
                self._pages[p] = raw[offset : offset + self.page_size]

        written = 0
        cur = self.pos
        while written < total_to_read:
            page_idx = cur // self.page_size
            page_offset = cur % self.page_size
            page_data = self._get_page(page_idx)
            if not page_data:
                break
            chunk_len = min(total_to_read - written, len(page_data) - page_offset)
            mv[written : written + chunk_len] = page_data[page_offset : page_offset + chunk_len]
            written += chunk_len
            cur += chunk_len

        self.pos = cur
        return written

