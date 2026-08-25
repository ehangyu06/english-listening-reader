"""Workplace entry for Listening Reader (Streamlit Cloud)."""

import base64
import json

import streamlit as st

st.set_page_config(page_title="Listening Reader", layout="wide")


def secret_get(*keys, default=""):
    cur = st.secrets
    try:
        for key in keys:
            cur = cur[key]
        return str(cur or "").strip()
    except Exception:
        return default


password = secret_get("auth", "password")
if password and not st.session_state.get("authenticated"):
    st.title("Listening Reader")
    st.caption("직장에서도 같은 학습자료를 봅니다.")
    entered = st.text_input("비밀번호", type="password")
    if st.button("입장", type="primary"):
        if entered == password:
            st.session_state.authenticated = True
            st.rerun()
        else:
            st.error("비밀번호가 올바르지 않습니다.")
    st.stop()

cloud = {
    "supabaseUrl": secret_get("supabase", "url"),
    "supabaseAnonKey": secret_get("supabase", "anon_key"),
}
target = "/app/static/index.html"
if cloud["supabaseUrl"] and cloud["supabaseAnonKey"]:
    packed = base64.b64encode(json.dumps(cloud).encode("utf-8")).decode("ascii")
    target += "#c=" + packed

st.title("Listening Reader")
st.success("입장했습니다. 아래 버튼을 직접 눌러 앱을 여세요.")
st.caption("아이패드 사파리에서는 자동으로 넘어가지 않습니다. 버튼을 눌러야 합니다.")
st.link_button("Listening Reader 열기", target, type="primary")
st.markdown(f"[같은 창에서 열기]({target})")
