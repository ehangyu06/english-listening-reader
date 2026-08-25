import { uid, escapeHtml, formatTime, formatBytes, toast } from "../utils.js?v=20260816p";
import { saveLesson, getFullAudioTrack } from "../storage/lessons.js?v=20260825c";
import { saveAudio, getAudio, deleteAudio, readAudioDuration, isAudioFile, MAX_AUDIO_BYTES, audioFileInputAttrs } from "../storage/audio.js?v=20260825c";
import { attachAudio, stopAudio } from "../services/audioPlayer.js?v=20260816p";

const SPEEDS = [0.8, 0.9, 1.0, 1.1, 1.2];
// TODO: add a 10-second A-B loop control on top of HTMLAudioElement.

export function audioPanelMarkup(lesson) {
  return `<aside class="lesson-study-audio" id="audio-panel">${emptyAudioMarkup()}</aside>`;
}

function emptyAudioMarkup() {
  return `
    <label class="audio-drop file-btn" id="audio-drop">
      <p class="audio-drop-title">🎧 오디오 파일 추가</p>
      <p class="hint">아이폰/아이패드에서는 사진·카메라가 같이 뜨더라도 <strong>파일</strong>을 누르세요. 아이클라우드나 Google Drive의 음성 메모(.m4a)를 고를 수 있습니다. Mac에서는 파일을 끌어놓아도 됩니다.</p>
      <span class="btn btn-play btn-play-lg">🎧 오디오 파일 추가</span>
      <input id="audio-file" class="file-overlay" type="file"${audioFileInputAttrs()}>
    </label>
  `;
}

function previewMarkup(file, duration) {
  return `
    <div class="player audio-preview">
      <div class="block-title">선택한 파일</div>
      <p class="audio-file-name">${escapeHtml(file.name)}</p>
      <p class="muted">길이 ${formatTime(duration)} · ${formatBytes(file.size)}</p>
      <div class="player-btns">
        <button type="button" class="btn btn-play btn-listen" id="audio-preview-play">▶ 미리 듣기</button>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-play" id="audio-save">이 Page에 저장</button>
        <button type="button" class="btn btn-ghost" id="audio-cancel">취소</button>
      </div>
    </div>
  `;
}

function missingAudioMarkup(track) {
  return `
    <div class="player audio-missing">
      <div class="player-kicker">🎧 Listening</div>
      <p class="audio-file-name">${escapeHtml(track.fileName || "audio")}</p>
      <p class="hint">이 페이지에 저장해 둔 음성입니다. 클라우드에 아직 파일이 없어서 아이패드에서 재생할 수 없습니다. 집 맥에서 앱을 한 번 열어 음성을 올린 뒤, 다시 불러오세요.</p>
      <div class="player-btns">
        <button type="button" class="btn btn-play" id="audio-retry">다시 불러오기</button>
      </div>
      <div class="form-actions">
        <label class="file-btn text-btn" id="audio-replace-label">
          오디오 교체
          <input id="audio-file" class="file-overlay" type="file"${audioFileInputAttrs()}>
        </label>
        <button type="button" class="text-btn danger" id="audio-delete">오디오 삭제</button>
      </div>
    </div>
  `;
}

function playerMarkup(track) {
  const speeds = SPEEDS.map((speed) => {
    const active = speed === 1 ? "is-active" : "";
    const text = speed === 1 ? "1.0x" : `${speed}x`;
    return `<button type="button" class="chip ${active}" data-audio-rate="${speed}">${text}</button>`;
  }).join("");

  return `
    <div class="player audio-player">
      <div class="player-kicker">🎧 Listening</div>
      <p class="audio-file-name">${escapeHtml(track.fileName || "audio")}</p>
      <div class="audio-transport">
        <button type="button" class="btn btn-ghost btn-skip" id="audio-back" aria-label="5초 뒤로">-5초</button>
        <button type="button" class="btn btn-play btn-play-round" id="audio-play" aria-label="재생">▶</button>
        <button type="button" class="btn btn-ghost btn-skip" id="audio-fwd" aria-label="5초 앞으로">+5초</button>
      </div>
      <input id="audio-seek" class="audio-seek" type="range" min="0" max="${Math.max(1, Math.floor(track.duration || 0))}" value="0" step="0.1">
      <div class="audio-time">
        <span id="audio-current">00:00</span>
        <span id="audio-total">${formatTime(track.duration || 0)}</span>
      </div>
      <div class="speed-row">
        <span class="muted">속도</span>
        ${speeds}
      </div>
      <div class="player-btns">
        <button type="button" class="btn btn-ghost btn-listen" id="audio-restart">처음부터</button>
        <button type="button" class="btn btn-ghost btn-listen" id="audio-loop">↻ 전체 반복</button>
      </div>
      <div class="form-actions">
        <label class="file-btn text-btn" id="audio-replace-label">
          오디오 교체
          <input id="audio-file" class="file-overlay" type="file"${audioFileInputAttrs()}>
        </label>
        <button type="button" class="text-btn danger" id="audio-delete">오디오 삭제</button>
      </div>
    </div>
  `;
}

export async function bindAudioPanel(root, lesson) {
  const mount = root.querySelector("#audio-panel");
  if (!mount) return;

  let pendingFile = null;
  let pendingDuration = 0;
  let pendingUrl = "";
  let loopOn = false;

  const renderEmpty = () => {
    stopAudio();
    mount.innerHTML = emptyAudioMarkup();
    bindEmpty();
  };

  const bindEmpty = () => {
    const input = mount.querySelector("#audio-file");
    const drop = mount.querySelector("#audio-drop");
    input?.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file) chooseFile(file);
      input.value = "";
    });
    bindDrop(drop, chooseFile);
  };

  const chooseFile = async (file, { replacing = false } = {}) => {
    if (!isAudioFile(file)) {
      toast("지원하는 오디오 파일만 선택할 수 있습니다. (mp3, m4a, wav, aac, webm)");
      return;
    }
    if (file.size > MAX_AUDIO_BYTES) {
      toast("파일이 너무 큽니다. 40MB 이하로 올려 주세요.");
      return;
    }
    pendingFile = file;
    pendingDuration = await readAudioDuration(file);
    if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    pendingUrl = URL.createObjectURL(file);
    stopAudio();
    mount.innerHTML = previewMarkup(file, pendingDuration);
    mount.querySelector("#audio-preview-play")?.addEventListener("click", () => {
      const audio = attachAudio(file);
      audio.play().catch(() => toast("미리 듣기를 시작하지 못했습니다."));
    });
    mount.querySelector("#audio-save")?.addEventListener("click", () => savePending(replacing));
    mount.querySelector("#audio-cancel")?.addEventListener("click", async () => {
      pendingFile = null;
      if (pendingUrl) URL.revokeObjectURL(pendingUrl);
      pendingUrl = "";
      stopAudio();
      const track = getFullAudioTrack(lesson);
      if (track) await showPlayer(track);
      else renderEmpty();
    });
  };

  const savePending = async (replacing) => {
    if (!pendingFile) return;
    const saveBtn = mount.querySelector("#audio-save");
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = "저장 중…";
    }
    try {
      const old = getFullAudioTrack(lesson);
      const blob = pendingFile.slice(0, pendingFile.size, pendingFile.type || "audio/mpeg");
      const audioId = uid();
      await saveAudio({
        id: audioId,
        blob,
        mimeType: blob.type || "audio/mpeg",
        fileName: pendingFile.name,
        createdAt: new Date().toISOString(),
      });
      const track = {
        id: uid(),
        type: "full",
        partNumber: null,
        audioId,
        fileName: pendingFile.name,
        mimeType: blob.type || "audio/mpeg",
        duration: pendingDuration,
        byteSize: pendingFile.size,
        addedAt: new Date().toISOString(),
      };
      lesson.audioTracks = (lesson.audioTracks || []).filter((item) => item.type !== "full");
      lesson.audioTracks.push(track);
      lesson.updatedAt = new Date().toISOString();
      await saveLesson(lesson);
      if (old?.audioId) {
        try {
          await deleteAudio(old.audioId);
        } catch (error) {
          console.warn(error);
        }
      }
      pendingFile = null;
      if (pendingUrl) URL.revokeObjectURL(pendingUrl);
      pendingUrl = "";
      toast(replacing ? "오디오를 교체했습니다." : "이 페이지에 오디오를 저장했습니다.");
      await showPlayer(track);
    } catch (error) {
      console.error(error);
      toast("오디오를 저장하지 못했습니다. 파일 크기를 확인하거나 다시 시도해 주세요.");
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = "이 Page에 저장";
      }
    }
  };

  const showPlayer = async (track) => {
    stopAudio();
    const record = await getAudio(track.audioId);
    if (!record?.blob) {
      mount.innerHTML = missingAudioMarkup(track);
      mount.querySelector("#audio-retry")?.addEventListener("click", async () => {
        toast("클라우드에서 다시 찾습니다.");
        await showPlayer(track);
      });
      const input = mount.querySelector("#audio-file");
      input?.addEventListener("change", () => {
        const file = input.files?.[0];
        if (!file) return;
        if (!confirm("기존 오디오 파일을 새 파일로 교체하시겠습니까?")) {
          input.value = "";
          return;
        }
        chooseFile(file, { replacing: true });
        input.value = "";
      });
      mount.querySelector("#audio-delete")?.addEventListener("click", async () => {
        if (!confirm("이 페이지의 오디오만 삭제할까요? Script와 학습 내용은 그대로 둡니다.")) return;
        const current = getFullAudioTrack(lesson);
        stopAudio();
        if (current?.audioId) await deleteAudio(current.audioId);
        lesson.audioTracks = (lesson.audioTracks || []).filter((item) => item.type !== "full");
        lesson.updatedAt = new Date().toISOString();
        await saveLesson(lesson);
        toast("오디오를 삭제했습니다.");
        renderEmpty();
      });
      return;
    }
    mount.innerHTML = playerMarkup(track);
    const audio = attachAudio(record.blob);
    audio.playbackRate = 1;
    audio.loop = loopOn;
    bindPlayer(audio, track);
  };

  const bindPlayer = (audio, track) => {
    const playBtn = mount.querySelector("#audio-play");
    const currentEl = mount.querySelector("#audio-current");
    const totalEl = mount.querySelector("#audio-total");
    const seek = mount.querySelector("#audio-seek");
    const loopBtn = mount.querySelector("#audio-loop");
    let seeking = false;

    const paint = () => {
      if (!seeking) seek.value = String(audio.currentTime || 0);
      currentEl.textContent = formatTime(audio.currentTime);
      const duration = Number.isFinite(audio.duration) ? audio.duration : track.duration || 0;
      seek.max = String(Math.max(1, duration));
      totalEl.textContent = formatTime(duration);
      playBtn.textContent = audio.paused ? "▶" : "⏸";
      loopBtn.classList.toggle("is-active", loopOn);
    };

    audio.addEventListener("timeupdate", paint);
    audio.addEventListener("loadedmetadata", paint);
    audio.addEventListener("play", paint);
    audio.addEventListener("pause", paint);
    audio.addEventListener("ended", paint);

    playBtn.addEventListener("click", () => {
      if (audio.paused) audio.play().catch(() => toast("재생을 시작하지 못했습니다."));
      else audio.pause();
    });
    mount.querySelector("#audio-back")?.addEventListener("click", () => {
      audio.currentTime = Math.max(0, audio.currentTime - 5);
    });
    mount.querySelector("#audio-fwd")?.addEventListener("click", () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : track.duration || 0;
      audio.currentTime = Math.min(duration, audio.currentTime + 5);
    });
    mount.querySelector("#audio-restart")?.addEventListener("click", () => {
      audio.currentTime = 0;
      audio.play().catch(() => toast("재생을 시작하지 못했습니다."));
    });
    loopBtn.addEventListener("click", () => {
      loopOn = !loopOn;
      audio.loop = loopOn;
      paint();
    });
    seek.addEventListener("input", () => {
      seeking = true;
      currentEl.textContent = formatTime(Number(seek.value));
    });
    seek.addEventListener("change", () => {
      audio.currentTime = Number(seek.value);
      seeking = false;
    });
    mount.querySelectorAll("[data-audio-rate]").forEach((btn) => {
      btn.addEventListener("click", () => {
        audio.playbackRate = Number(btn.dataset.audioRate) || 1;
        mount.querySelectorAll("[data-audio-rate]").forEach((item) => item.classList.toggle("is-active", item === btn));
      });
    });

    const input = mount.querySelector("#audio-file");
    input?.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!confirm("기존 오디오 파일을 새 파일로 교체하시겠습니까?")) {
        input.value = "";
        return;
      }
      chooseFile(file, { replacing: true });
      input.value = "";
    });
    mount.querySelector("#audio-delete")?.addEventListener("click", async () => {
      if (!confirm("이 페이지의 오디오만 삭제할까요? Script와 학습 내용은 그대로 둡니다.")) return;
      const current = getFullAudioTrack(lesson);
      stopAudio();
      if (current?.audioId) await deleteAudio(current.audioId);
      lesson.audioTracks = (lesson.audioTracks || []).filter((item) => item.type !== "full");
      lesson.updatedAt = new Date().toISOString();
      await saveLesson(lesson);
      toast("오디오를 삭제했습니다.");
      renderEmpty();
    });
    paint();
  };

  try {
    const track = getFullAudioTrack(lesson);
    if (track) await showPlayer(track);
    else renderEmpty();
  } catch (error) {
    console.error(error);
    renderEmpty();
  }
}

function bindDrop(drop, onFile) {
  if (!drop) return;
  drop.addEventListener("dragover", (event) => {
    event.preventDefault();
    drop.classList.add("is-over");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
  drop.addEventListener("drop", (event) => {
    event.preventDefault();
    drop.classList.remove("is-over");
    const file = event.dataTransfer?.files?.[0];
    if (file) onFile(file);
  });
}
