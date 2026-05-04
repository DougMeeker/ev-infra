"""
Utility for sending transactional emails (registration verification, etc.).

When SMTP_HOST is not configured, the verification link is written to the
Flask log at INFO level so local dev still works without an SMTP server.
"""

import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import logging

logger = logging.getLogger(__name__)


def send_verification_email(app, to_email: str, to_name: str, verification_url: str) -> bool:
    """Send an account-verification email. Returns True on success."""
    smtp_host = app.config.get("SMTP_HOST", "")
    if not smtp_host:
        # No SMTP configured – print the link so admins / devs can verify manually
        logger.info(
            "SMTP not configured. Verification link for %s: %s",
            to_email,
            verification_url,
        )
        return True

    smtp_port = app.config.get("SMTP_PORT", 587)
    smtp_username = app.config.get("SMTP_USERNAME", "")
    smtp_password = app.config.get("SMTP_PASSWORD", "")
    smtp_from = app.config.get("SMTP_FROM", "noreply@svgc32zevi.dot.ca.gov")
    use_tls = app.config.get("SMTP_USE_TLS", True)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Verify your EV Infrastructure App account"
    msg["From"] = smtp_from
    msg["To"] = to_email

    text_body = (
        f"Hello {to_name},\n\n"
        "Please verify your email address to activate your account:\n\n"
        f"{verification_url}\n\n"
        "This link expires in 24 hours.\n\n"
        "If you did not register, please ignore this email."
    )
    html_body = (
        f"<p>Hello {to_name},</p>"
        "<p>Please verify your email address to activate your "
        "<strong>EV Infrastructure App</strong> account:</p>"
        f'<p><a href="{verification_url}">{verification_url}</a></p>'
        "<p>This link expires in 24 hours.</p>"
        "<p>If you did not register, please ignore this email.</p>"
    )

    msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    try:
        if use_tls:
            with smtplib.SMTP(smtp_host, smtp_port) as server:
                server.starttls()
                if smtp_username:
                    server.login(smtp_username, smtp_password)
                server.sendmail(smtp_from, to_email, msg.as_string())
        else:
            with smtplib.SMTP_SSL(smtp_host, smtp_port) as server:
                if smtp_username:
                    server.login(smtp_username, smtp_password)
                server.sendmail(smtp_from, to_email, msg.as_string())
        return True
    except Exception as exc:
        logger.error("Failed to send verification email to %s: %s", to_email, exc)
        return False
