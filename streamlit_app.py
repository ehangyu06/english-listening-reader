"""Workplace entry for Listening Reader (Streamlit Cloud)."""

import json
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components

ROOT = Path(__file__).resolve().parent

st.set_page_config(page_title="Listening Reader", layout="wide", initial_sidebar_state="collapsed")


def secret_get(*keys, default=""):
    cur = st.secrets
    try:
        for key in keys:
            cur = cur[key]
        return str(cur or "").strip()
    except Exception:
        return default


def inject_cloud_html(cloud):
    page = (ROOT / "index.html").read_text(encoding="utf-8")
    page = page.replace("./css/", "/app/static/css/")
    page = page.replace("./js/", "/app/static/js/")
    payload = json.dumps(cloud, ensure_ascii=True)
    snippet = f"<script>window.__LISTENING_CLOUD__={payload};</script>"
    return page.replace("</head>", snippet + "</head>", 1)


password = secret_get("auth", "password")
if password and not st.session_state.get("authenticated"):
    st.title("Listening Reader")
    st.caption("직장에서도 같은 학습자료를 봅니다.")
    entered = st.text_input("비밀번호", type="password")
    if st.button("입장", type="primary"):
        if entered == password:
            st.session_state.authenticated = True
        else:
            st.error("비밀번호가 올바르지 않습니다.")
    if not st.session_state.get("authenticated"):
        st.stop()

cloud = {
    "supabaseUrl": secret_get("supabase", "url"),
    "supabaseAnonKey": secret_get("supabase", "anon_key"),
}

st.markdown(
    """
    <style>
      header, footer, #MainMenu { visibility: hidden; }
      .block-container { padding: 0 !important; max-width: 100% !important; }
    </style>
    """,
    unsafe_allow_html=True,
)

components.html(inject_cloud_html(cloud), height=1400, scrolling=True)
st.caption("학습 화면이 비어 있으면 아래로 조금 스크롤해 보세요.")
