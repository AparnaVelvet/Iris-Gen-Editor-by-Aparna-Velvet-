import os
import re
import sys
import tempfile
import shutil
import requests
import streamlit as st

# Set Streamlit Page Config for dark themed aesthetic
st.set_page_config(
    page_title="Iris Gen Editor by Aparna Velvet",
    page_icon="🎬",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom Cyberpunk Fuchsia CSS Injection
st.markdown("""
<style>
    /* Dark Slate Canvas & Fuchsia Accents */
    .stApp {
        background-color: #0d0d11;
        color: #f0f0f5;
    }
    
    /* Styled main header */
    .app-title {
        font-family: 'Space Grotesk', 'Inter', sans-serif;
        color: #f0f0f5;
        font-weight: 900;
        letter-spacing: -1px;
        margin-bottom: 5px;
        text-transform: uppercase;
    }
    .fuchsia-glow {
        color: #D10068;
        text-shadow: 0 0 12px rgba(209, 0, 104, 0.6);
    }
    
    /* Segment headers */
    h1, h2, h3, h4 {
        color: #f0f0f5 !important;
        font-family: 'Space Grotesk', sans-serif !important;
    }
    
    /* Sidebar aesthetic adjustments */
    section[data-testid="stSidebar"] {
        background-color: #08080c !important;
        border-right: 1px solid #1e1e24 !important;
    }
    
    /* Status banner override styling */
    .stAlert {
        background-color: #121217 !important;
        border: 1px solid #D10068 !important;
        border-radius: 4px !important;
    }
    
    /* Buttons aesthetics */
    div.stButton > button {
        background-color: #D10068 !important;
        color: #000000 !important;
        font-weight: 800 !important;
        font-family: 'Space Grotesk', sans-serif !important;
        text-transform: uppercase !important;
        letter-spacing: 0.5px !important;
        border: none !important;
        border-radius: 4px !important;
        padding: 0.5rem 2rem !important;
        box-shadow: 0 0 15px rgba(209, 0, 104, 0.3) !important;
        transition: all 0.2s ease-in-out !important;
    }
    div.stButton > button:hover {
        opacity: 0.9 !important;
        transform: scale(1.02) !important;
        box-shadow: 0 0 25px rgba(209, 0, 104, 0.6) !important;
    }
    
    /* Code container text readability */
    code {
        color: #ff57a0 !important;
        background-color: #181820 !important;
    }
</style>
""", unsafe_allow_html=True)

# Try fetching Gemini SDK components safely
try:
    from google import genai
    from google.genai import types
    NEW_SDK_AVAILABLE = True
except ImportError:
    try:
        import google.generativeai as genai_legacy
        NEW_SDK_AVAILABLE = False
    except ImportError:
        NEW_SDK_AVAILABLE = False

# Try MoviePy imports safely
try:
    from moviepy.editor import VideoFileClip, AudioFileClip, TextClip, CompositeVideoClip, concatenate_videoclips, vfx
except ImportError:
    try:
         from moviepy import VideoFileClip, AudioFileClip, TextClip, CompositeVideoClip, concatenate_videoclips, vfx
    except ImportError:
         pass 

# ==============================================================================
# 🌟 MOVIEPY VERSION-AGNOSTIC COMPATIBILITY WRAPPERS
# ==============================================================================

def safe_subclip(clip, start, end):
    if hasattr(clip, "subclipped"): 
        return clip.subclipped(start, end)
    return clip.subclip(start, end)

def safe_resize(clip, scale_factor):
    if hasattr(clip, "resized"): 
        return clip.resized(scale_factor)
    return clip.resize(scale_factor)

def safe_crop(clip, x1, y1, x2, y2):
    if hasattr(clip, "cropped"): 
        return clip.cropped(x1=x1, y1=y1, x2=x2, y2=y2)
    return clip.crop(x1=x1, y1=y1, x2=x2, y2=y2)

def safe_loop(clip, duration):
    if hasattr(clip, "looped"): 
        return clip.looped(duration=duration)
    if hasattr(clip, "loop"): 
        return clip.loop(duration=duration)
    try:
        from moviepy.video.fx import loop
        return loop(clip, duration=duration)
    except Exception:
        return clip

def safe_with_duration(clip, duration):
    if hasattr(clip, "with_duration"): 
        return clip.with_duration(duration)
    return clip.set_duration(duration)

def safe_with_position(clip, position):
    if hasattr(clip, "with_position"): 
        return clip.with_position(position)
    return clip.set_position(position)

def safe_with_audio(clip, audio):
    if hasattr(clip, "with_audio"): 
        return clip.with_audio(audio)
    return clip.set_audio(audio)

def create_text_clip(text, fs, target_width, duration, target_height):
    try:
        txt_clip = TextClip(
            text=text,
            font_size=fs,
            color="white",
            font="Courier-Bold",
            stroke_color="black",
            stroke_width=2.5,
            size=(target_width - 100, None),
            method="caption"
        )
    except Exception:
        txt_clip = TextClip(
            text,
            fontsize=fs,
            color="white",
            font="Courier-Bold",
            stroke_color="black",
            stroke_width=2.5,
            size=(target_width - 100, None),
            method="caption"
        )
    
    txt_clip = safe_with_duration(txt_clip, duration)
    txt_clip = safe_with_position(txt_clip, ("center", target_height - 180))
    return txt_clip
    # ==============================================================================
# 🧩 HELPER FUNCTIONS & BUSINESS LOGIC
# ==============================================================================

def parse_timecode(timecode):
    parts = timecode.replace(",", ".").split(":")
    hours = float(parts[0])
    minutes = float(parts[1])
    seconds = float(parts[2])
    return hours * 3600 + minutes * 60 + seconds

def parse_srt_string(srt_content):
    blocks = re.split(r'\n\s*\n', srt_content.strip())
    parsed_blocks = []
    time_pattern = r"(\d{1,2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{3})"
    
    for block in blocks:
        lines = [line.strip() for line in block.split('\n') if line.strip()]
        if len(lines) < 2:
            continue
        
        time_line_index = -1
        for idx, line in enumerate(lines):
            if "-->" in line:
                time_line_index = idx
                break
                
        if time_line_index == -1:
            continue
            
        match = re.search(time_pattern, lines[time_line_index])
        if not match:
            continue
            
        start_sec = parse_timecode(match.group(1))
        end_sec = parse_timecode(match.group(2))
        sub_text = " ".join(lines[time_line_index+1:])
        
        parsed_blocks.append({
            "id": len(parsed_blocks) + 1,
            "start": start_sec,
            "end": end_sec,
            "duration": max(0.1, end_sec - start_sec),
            "text": sub_text
        })
    return parsed_blocks

def get_gemini_keywords(block_text, gemini_api_key):
    if not gemini_api_key:
        return [clean_keyword(block_text)]
        
    prompt = f"""
    You are a video editor selecting high-quality B-roll stock video concepts.
    Analyze the following narration segment and output EXACTLY one descriptive cinematic B-roll concept search keyword term (1-3 words max).
    Do NOT output punctuation, numbers, titles, explanations, or quotes. Output ONLY the plain search term.
    
    Narration Segment: \"{block_text}\"
    """
    
    try:
        if NEW_SDK_AVAILABLE:
            client = genai.Client(api_key=gemini_api_key)
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
                config=types.GenerateContentConfig(temperature=0.4, max_output_tokens=15)
            )
            term = response.text.strip().replace('"', '').replace('.', '')
            return [term] if term else [clean_keyword(block_text)]
        else:
            genai_legacy.configure(api_key=gemini_api_key)
            model = genai_legacy.GenerativeModel('gemini-1.5-flash')
            response = model.generate_content(prompt)
            term = response.text.strip().replace('"', '').replace('.', '')
            return [term] if term else [clean_keyword(block_text)]
    except Exception:
        return [clean_keyword(block_text)]

def clean_keyword(text):
    clean = re.sub(r'[^a-zA-Z\s]', '', text).strip()
    words = [w for w in clean.split() if len(w) > 3]
    if len(words) >= 2:
        return " ".join(words[:2]).lower()
    elif len(words) == 1:
        return words[0].lower()
    return "cyberpunk technology"

def fetch_pexels_video_url(search_term, pexels_key, is_vertical=True):
    if not pexels_key:
        return None
        
    headers = {"Authorization": pexels_key}
    orientation_param = "portrait" if is_vertical else "landscape"
    url = f"https://api.pexels.com/videos/search?query={requests.utils.quote(search_term)}&per_page=3&orientation={orientation_param}"
    
    try:
        response = requests.get(url, headers=headers, timeout=12)
        if response.status_code == 200:
            data = response.json()
            videos = data.get("videos", [])
            for video in videos:
                video_files = video.get("video_files", [])
                target_dimension = 1080
                
                for f in video_files:
                    w = f.get("width") or 0
                    h = f.get("height") or 0
                    link = f.get("link")
                    if link and (w == target_dimension or h == target_dimension):
                        return link
                
                for f in video_files:
                    link = f.get("link")
                    if link and "mp4" in link:
                        return link
        return None
    except Exception:
        return None

# ==============================================================================
# 🚀 MAIN APPLICATION STRUCTURING
# ==============================================================================

def main():
    st.markdown('<h1 class="app-title">🎬 Iris Gen Editor <span class="fuchsia-glow">by Aparna Velvet</span></h1>', unsafe_allow_html=True)
    st.markdown("<p style='font-family: monospace; font-size: 13px; color: #a3a3ac; margin-top: -10px; margin-bottom: 25px;'>Cyberpunk 1080p MoviePy Automation & Video Compiling Control Room</p>", unsafe_allow_html=True)

    # ------------------ SIDEBAR ------------------
    st.sidebar.markdown('<h3 style="color: #D10068; text-shadow: 0 0 8px rgba(209, 0, 104, 0.4);">⚙️ Pipeline Settings</h3>', unsafe_allow_html=True)
    
    gemini_api_key = st.sidebar.text_input(
        "GEMINI_API_KEY",
        type="password",
        value=os.environ.get("GEMINI_API_KEY", ""),
        help="Used to generate smart visual search query tags from your subtitle strings."
    )
    
    pexels_api_key = st.sidebar.text_input(
        "PEXELS_API_KEY",
        type="password",
        value=os.environ.get("PEXELS_API_KEY", ""),
        help="Required to authorize download streams for HD B-roll stock clips."
    )

    st.sidebar.markdown("<br>", unsafe_allow_html=True)
    st.sidebar.markdown("##### 🎞️ Aspect Ratio & Format")
    aspect_choice = st.sidebar.radio(
        "Select output video shape:",
        options=["Horizontal Full HD (16:9 for YouTube)", "Vertical Full HD (9:16 for Shorts/TikTok)"],
        index=0
    )
    is_vertical = "Vertical" in aspect_choice
    target_width = 1080 if is_vertical else 1920
    target_height = 1920 if is_vertical else 1080

    st.sidebar.markdown("<br>", unsafe_allow_html=True)
    st.sidebar.markdown("##### 💬 Text Subtitle Rendering")
    subtitle_render_mode = st.sidebar.selectbox(
        "Select Subtitle overlay action:",
        options=[
            "None (Strictly Audio Overlay ONLY & Timing Alignment)", 
            "Burn Subtitles (Fuchsia-shadow neon caption cards)"
        ],
        index=0
    )
    is_burn_subtitles = "Burn Subtitles" in subtitle_render_mode

    # ------------------ MAIN SECTION ------------------
    st.markdown("### 🗂️ Step 1: Upload Workspace Assets")
    
    col1, col2 = st.columns(2)
    with col1:
        st.markdown("**1. Narration Subtitle Sequence (.srt)**")
        srt_file = st.file_uploader("Upload SRT file", type=["srt"], label_visibility="collapsed")
        if srt_file:
            st.success("✓ SRT File uploaded!")
            
    with col2:
        st.markdown("**2. Custom Background Audio Track (.mp3, .wav)**")
        audio_file = st.file_uploader("Upload background sound track", type=["mp3", "wav"], label_visibility="collapsed")
        if audio_file:
            st.success("✓ Audio File uploaded!")

    parsed_blocks = []
    if srt_file:
        try:
            srt_content = srt_file.getvalue().decode("utf-8")
            parsed_blocks = parse_srt_string(srt_content)
        except Exception as e:
            st.error(f"❌ Error parsing SRT: {e}")

    st.markdown("<br>", unsafe_allow_html=True)
    st.markdown("### 🛠️ Step 2: Render Automation Control Deck")
    
    assets_missing = not srt_file or not audio_file
    if assets_missing:
        st.warning("📥 Please upload both files to activate the engine.")

    trigger_btn = st.button("🎬 Generate Video Pipeline", disabled=assets_missing, use_container_width=True)

    if trigger_btn:
        progress_bar = st.progress(0)
        status_text = st.empty()
        log_box = st.empty()
        
        logs = []
        def append_log(text, log_type="info"):
            prefix = "[INFO]" if log_type == "info" else ("[SUCCESS]" if log_type == "success" else "[ERROR]")
            logs.append(f"{prefix} {text}")
            log_box.code("\n".join(logs), language="bash")

        status_text.text("Starting system environment config...")
        progress_bar.progress(10)
        
        temp_dir = tempfile.mkdtemp()
        try:
            temp_audio_path = os.path.join(temp_dir, "input_audio.mp3")
            with open(temp_audio_path, "wb") as f_aud:
                f_aud.write(audio_file.getvalue())
            
            segment_videos = []
            fallback_video_url = "https://videos.pexels.com/video-files/5198159/5198159-uhd_1080_1920_25fps.mp4" if is_vertical else "https://videos.pexels.com/video-files/3129957/3129957-uhd_1920_1080_25fps.mp4"
            
            for idx, block in enumerate(parsed_blocks):
                status_text.text(f"Downloading clip tags {idx+1}/{len(parsed_blocks)}...")
                progress_bar.progress(10 + int((idx / len(parsed_blocks)) * 40))
                
                keywords = get_gemini_keywords(block["text"], gemini_api_key)
                search_query = keywords[0] if keywords else clean_keyword(block["text"])
                
                video_url = None
                if pexels_api_key:
                    video_url = fetch_pexels_video_url(search_query, pexels_api_key, is_vertical)
                
                if not video_url:
                    video_url = fallback_video_url
                    
                dest_path = os.path.join(temp_dir, f"clip_{block['id']}.mp4")
                r = requests.get(video_url, stream=True, timeout=15)
                if r.status_code == 200:
                    with open(dest_path, 'wb') as f_vid:
                        shutil.copyfileobj(r.raw, f_vid)
                
                segment_videos.append({
                    "id": block["id"], "path": dest_path, 
                    "duration": block["duration"], "text": block["text"]
                })

            status_text.text("RAM-Safe Video Processing Initialized...")
            progress_bar.progress(60)
            append_log("Starting RAM-Optimized clip compilation sequence...", "info")
            
            video_clips_array = []
            
            for item in segment_videos:
                raw_clip = VideoFileClip(item["path"]).without_audio()
                
                if raw_clip.duration < item["duration"]:
                    processed = safe_loop(raw_clip, duration=item["duration"])
                else:
                    processed = safe_subclip(raw_clip, 0, item["duration"])
                
                # Aspect scaling and exact crop sizing
                cw, ch = processed.size
                scale = max(target_width / cw, target_height / ch)
                processed = safe_resize(processed, scale)
                nw, nh = processed.size
                processed = safe_crop(processed, x1=(nw-target_width)/2, y1=(nh-target_height)/2, x2=(nw+target_width)/2, y2=(nh+target_height)/2)
                
                if is_burn_subtitles:
                    try:
                        fs = 36 if is_vertical else 44
                        txt = create_text_clip(item["text"], fs, target_width, item["duration"], target_height)
                        comp = CompositeVideoClip([processed, txt], size=(target_width, target_height))
                        comp = safe_with_duration(comp, item["duration"])
                        video_clips_array.append(comp)
                    except Exception:
                        video_clips_array.append(processed)
                else:
                    video_clips_array.append(processed)
                
                # Crucial low-RAM step: Free the handle to the downloaded clip file immediately
                raw_clip.close()

            status_text.text("Chaining sequences together (Ultra-Low Memory Mode)...")
            progress_bar.progress(75)
            
            # Using method="chain" avoids holding every single frame array in RAM at the same time
            final_video = concatenate_videoclips(video_clips_array, method="chain")
            
            try:
                audio_clip = AudioFileClip(temp_audio_path)
                if audio_clip.duration > final_video.duration:
                    audio_clip = safe_subclip(audio_clip, 0, final_video.duration)
                final_video = safe_with_audio(final_video, audio_clip)
            except Exception as ae:
                append_log(f"Audio tracking skipped: {ae}", "warning")

            final_output_path = os.path.join(temp_dir, "low_ram_output.mp4")
            status_text.text("Encoding frame timeline (1 Thread Mode)...")
            append_log("Executing single-threaded compression to bypass Android limits...", "info")
            
            # Rendering with a single thread ensures the OS won't kill Termux for sudden spikes
            final_video.write_videofile(
                final_output_path,
                fps=24,
                codec="libx264",
                audio_codec="aac",
                threads=1,
                preset="ultrafast",
                logger=None
            )
            
            progress_bar.progress(100)
            status_text.text("Compilation complete!")
            append_log("🌟 WORKSPACE RENDER EXECUTED WITHOUT CRASHING!", "success")
            
            with open(final_output_path, "rb") as f_out:
                final_bytes = f_out.read()

            # Clean up all open streams completely
            final_video.close()
            for c in video_clips_array:
                c.close()
            
            st.markdown("---")
            st.markdown("<h3 style='color: #D10068;'>🎉 Generated Video Output Room</h3>", unsafe_allow_html=True)
            
            col_preview, col_down = st.columns([3, 1])
            with col_preview:
                st.video(final_output_path)
            with col_down:
                st.markdown("<br><br>", unsafe_allow_html=True)
                st.download_button(
                    label="💾 Download Processed MP4",
                    data=final_bytes,
                    file_name="iris_final_video.mp4",
                    mime="video/mp4",
                    use_container_width=True
                )

        except Exception as pipeline_err:
            st.error(f"❌ Pipeline Failure: {pipeline_err}")
        finally:
            try:
                shutil.rmtree(temp_dir)
            except Exception:
                pass

if __name__ == "__main__":
    main()
