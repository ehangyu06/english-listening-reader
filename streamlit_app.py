"""Workplace entry: Streamlit buttons freeze in Safari, so this page only points to the real app."""

import streamlit as st

PAGES_URL = "https://ehangyu06.github.io/english-listening-reader/?r=20260828a"

st.set_page_config(page_title="Listening Reader", layout="centered")
st.title("Listening Reader")
st.caption("아이패드·직장에서는 아래 주소를 쓰세요. 이 화면의 입장 버튼은 사파리에서 멈춥니다.")
st.link_button("학습 앱 열기", PAGES_URL, type="primary")
st.markdown(f"주소: {PAGES_URL}")
st.caption("처음 열면 홈 화면에서 Project URL과 anon 키를 한 번만 넣으면 됩니다. 맥에서 쓰던 그 두 값입니다.")
