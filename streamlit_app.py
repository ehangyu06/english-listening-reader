"""Workplace entry for Listening Reader (Streamlit Cloud)."""

import json

import streamlit as st
import streamlit.components.v1 as components

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
payload = json.dumps(cloud, ensure_ascii=False)

st.caption("Listening Reader를 여는 중입니다.")
st.markdown("[앱이 안 열리면 여기를 누르세요](/app/static/index.html)")

components.html(
    f"""
<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <script>
      (function () {{
        var cloud = {payload};
        var target = "/app/static/index.html";
        try {{
          if (cloud.supabaseUrl && cloud.supabaseAnonKey) {{
            window.top.localStorage.setItem("listening-cloud", JSON.stringify(cloud));
          }}
        }} catch (error) {{}}
        try {{
          window.top.location.replace(target);
        }} catch (error) {{
          window.location.replace(target);
        }}
      }})();
    </script>
  </head>
  <body>
    <p><a href="/app/static/index.html" target="_top">Listening Reader 열기</a></p>
  </body>
</html>
""",
    height=80,
)
