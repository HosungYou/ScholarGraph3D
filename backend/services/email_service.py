"""
Email notification service for ScholarGraph3D.

Uses Resend API (https://resend.com) for transactional emails.
No SDK dependency -- uses httpx directly for minimal footprint.
"""

import logging
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)


class EmailService:
    """
    Resend-based email service for watch query digest notifications.

    Usage:
        svc = EmailService(api_key="re_xxx")
        await svc.send_watch_digest("user@example.com", "transformer attention", papers)
    """

    def __init__(
        self,
        api_key: str,
        from_email: str = "notifications@scholargraph3d.com",
        timeout: float = 15.0,
    ):
        self.api_key = api_key
        self.from_email = from_email
        self.base_url = "https://api.resend.com"
        self._client = httpx.AsyncClient(
            timeout=timeout,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
        )

    async def close(self) -> None:
        """Release HTTP client resources."""
        await self._client.aclose()

    async def send_watch_digest(
        self,
        to_email: str,
        query: str,
        new_papers: List[Dict[str, Any]],
    ) -> bool:
        """
        Send a weekly digest email for a watch query via Resend API.

        Args:
            to_email: Recipient email address.
            query: The watch query text.
            new_papers: List of new papers found. Each dict should contain:
                title, authors, year, venue, oa_url, doi.

        Returns:
            True if the email was sent successfully, False otherwise.
        """
        if not new_papers:
            logger.debug(f"No new papers for query '{query}', skipping email to {to_email}")
            return False

        if not self.api_key:
            logger.warning("Resend API key not configured, skipping email")
            return False

        subject = f"ScholarGraph3D: {len(new_papers)} new paper(s) for \"{query}\""
        html = self._build_digest_html(query, new_papers)

        payload = {
            "from": self.from_email,
            "to": [to_email],
            "subject": subject,
            "html": html,
        }

        try:
            response = await self._client.post(
                f"{self.base_url}/emails",
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
            logger.info(
                f"Watch digest sent to {to_email} for query '{query}' "
                f"({len(new_papers)} papers, id={data.get('id', 'unknown')})"
            )
            return True
        except httpx.HTTPStatusError as e:
            logger.error(
                f"Resend API error sending to {to_email}: "
                f"{e.response.status_code} {e.response.text}"
            )
            return False
        except httpx.RequestError as e:
            logger.error(f"Resend request error sending to {to_email}: {e}")
            return False

    def _build_digest_html(self, query: str, papers: List[Dict[str, Any]]) -> str:
        """
        Build an HTML email template for the watch digest.

        Clean, academic style with paper list and action links.
        """
        paper_rows = []
        for paper in papers:
            title = _escape_html(paper.get("title", "Untitled"))
            year = paper.get("year", "n.d.")
            venue = _escape_html(paper.get("venue", ""))
            doi = paper.get("doi", "")
            oa_url = paper.get("oa_url", "")

            # Format authors
            authors_raw = paper.get("authors", [])
            if isinstance(authors_raw, list) and authors_raw:
                author_names = []
                for a in authors_raw[:3]:
                    if isinstance(a, dict):
                        author_names.append(a.get("name", a.get("display_name", "")))
                    elif isinstance(a, str):
                        author_names.append(a)
                author_str = ", ".join(n for n in author_names if n)
                if len(authors_raw) > 3:
                    author_str += " et al."
            else:
                author_str = "Unknown authors"

            # Build link
            link = ""
            if oa_url:
                link = f'<a href="{_escape_html(oa_url)}" style="color:#4A90D9;">Open Access</a>'
            elif doi:
                doi_url = f"https://doi.org/{doi}" if not doi.startswith("http") else doi
                link = f'<a href="{_escape_html(doi_url)}" style="color:#4A90D9;">DOI</a>'

            venue_str = f" &mdash; <em>{venue}</em>" if venue else ""

            paper_rows.append(f"""
            <tr>
                <td style="padding:12px 16px;border-bottom:1px solid #eee;">
                    <div style="font-size:15px;font-weight:600;color:#1a1a1a;margin-bottom:4px;">
                        {title}
                    </div>
                    <div style="font-size:13px;color:#666;margin-bottom:4px;">
                        {_escape_html(author_str)} ({year}){venue_str}
                    </div>
                    <div style="font-size:13px;">
                        {link}
                    </div>
                </td>
            </tr>
            """)

        papers_html = "\n".join(paper_rows)
        escaped_query = _escape_html(query)

        return f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:24px;">
        <!-- Header -->
        <div style="background:#1a1a2e;color:white;padding:24px;border-radius:8px 8px 0 0;text-align:center;">
            <h1 style="margin:0;font-size:20px;font-weight:600;">ScholarGraph3D</h1>
            <p style="margin:8px 0 0;font-size:14px;opacity:0.8;">Watch Query Digest</p>
        </div>

        <!-- Body -->
        <div style="background:white;padding:24px;border-radius:0 0 8px 8px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
            <p style="font-size:15px;color:#333;margin:0 0 8px;">
                Your watch query <strong>"{escaped_query}"</strong> found
                <strong>{len(papers)}</strong> new paper(s):
            </p>

            <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                {papers_html}
            </table>

            <div style="text-align:center;margin-top:24px;">
                <a href="https://scholargraph3d.com/explore?q={escaped_query}"
                   style="display:inline-block;background:#4A90D9;color:white;padding:12px 24px;
                          border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">
                    View in ScholarGraph3D
                </a>
            </div>
        </div>

        <!-- Footer -->
        <div style="text-align:center;padding:16px;font-size:12px;color:#999;">
            You are receiving this because you set up a watch query on ScholarGraph3D.
            <br>To unsubscribe, delete the watch query in your dashboard.
        </div>
    </div>
</body>
</html>
"""


def _escape_html(text: str) -> str:
    """Minimal HTML escaping for email content."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )
