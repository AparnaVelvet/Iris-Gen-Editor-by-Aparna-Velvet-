import { ScriptConfig } from "./types";

export const DEFAULT_SRT = `1
00:00:01,000 --> 00:00:04,500
In the shadows of the digital frontier, we build the future.

2
00:00:05,200 --> 00:00:09,800
Unseen streams of raw binary code pulse through deep subway server arrays.

3
00:00:10,500 --> 00:00:15,000
Every node lights up in fuchsia neon, forging a state of the art neural link.

4
00:00:15,600 --> 00:00:19,800
This is not a simulation. The hacker protocol has officially initiated.`;

export const getPythonScript = (config: ScriptConfig): string => {
  const isVerticalStr = config.isVertical ? "True" : "False";
  const geminiEnvVar = "process.env.GEMINI_API_KEY or os.environ.get('GEMINI_API_KEY')";
  const pexelsKeyVal = config.pexelsKey ? `"${config.pexelsKey}"` : "os.environ.get('PEXELS_API_KEY')";

  return `#!/usr/bin/env python3
"""
================================================================================
Matrix Video Synth: Automated video creation using MoviePy, Gemini, and Pexels.
Theme: Cyberpunk Hacker Fuchsia Neon // Strict 1080p Resolution Constraint
================================================================================

INSTRUCTIONS FOR SETUP AND INSTALLATION:
----------------------------------------
1. Pip Install required dependencies:
   pip install google-genai moviepy requests

2. Ensure you have ffmpeg and ImageMagick installed on your system.
   - For subtitle text rendering, MoviePy relies on ImageMagick.
   - If you see Windows errors regarding "ImageMagick binary not found",
     set the IMAGEMAGICK_BINARY env variable or configure moviepy's config.py file.
     See: https://zulko.github.io/moviepy/install.html

3. Set your environment variables:
   export GEMINI_API_KEY="your_api_key"
   export PEXELS_API_KEY="your_pexels_key"

4. Run the script:
   python3 generate_video.py
"""

import os
import re
import sys
import shutil
import requests
from google import genai
from google.genai import types

# MoviePy imports (Supports both MoviePy v1.x and v2.x)
try:
    from moviepy.editor import VideoFileClip, AudioFileClip, TextClip, CompositeVideoClip, concatenate_videoclips, vfx
except ImportError:
    # MoviePy v2.x packaging
    from moviepy import VideoFileClip, AudioFileClip, TextClip, CompositeVideoClip, concatenate_videoclips, vfx

# ==============================================================================
# 🛠️ CONFIGURATION SETTINGS
# ==============================================================================
AUDIO_PATH = "${config.audioPath}"
SRT_PATH = "${config.srtPath}"
OUTPUT_VIDEO_PATH = "${config.outputVideoPath}"

# Target Aspect Ratio Toggle: 
# True = Vertical (9:16, e.g. TikTok / Shorts (1080x1920))
# False = Horizontal (16:9, e.g. YouTube (1920x1080))
IS_VERTICAL = ${isVerticalStr}

# API Keys
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
PEXELS_API_KEY = os.environ.get("PEXELS_API_KEY") or ${pexelsKeyVal}

TEMP_DIR = "./temp_video_clips"

# Fallback stock visual URLs if API fails or yields no results
FALLBACK_VIDEO_HORIZ = "https://videos.pexels.com/video-files/3129957/3129957-uhd_1920_1080_25fps.mp4"
FALLBACK_VIDEO_VERT = "https://videos.pexels.com/video-files/5198159/5198159-uhd_1080_1920_25fps.mp4"

# ==============================================================================
# 🧩 SRT SUBTITLE PARSING
# ==============================================================================
def parse_timecode(timecode):
    """Converts standard SRT time stamp '00:00:02,120' to float seconds."""
    parts = timecode.replace(",", ".").split(":")
    hours = float(parts[0])
    minutes = float(parts[1])
    seconds = float(parts[2])
    return hours * 3600 + minutes * 60 + seconds

def parse_srt(srt_file_path):
    """Parses an .srt file to yield subtitle blocks with start, end, and text."""
    if not os.path.exists(srt_file_path):
        print(f"❌ Error: SRT file not found at: {srt_file_path}")
        print("Creating a temporary cyber sample.srt so you can test immediately...")
        create_sample_srt(srt_file_path)

    with open(srt_file_path, "r", encoding="utf-8") as f:
        content = f.read().strip()

    # Split contents by empty lines or double carriage returns
    blocks = re.split(r"\\n\\s*\\n", content)
    parsed_blocks = []

    # Regex pattern to match timecodes
    time_pattern = r"(\\d{2}:\\d{2}:\\d{2}[,.]\\d{3})\\s*-->\\s*(\\d{2}:\\d{2}:\\d{2}[,.]\\d{3})"

    for block in blocks:
        lines = [line.strip() for line in block.split("\\n") if line.strip()]
        if len(lines) < 3:
            continue
        
        # Search for timestamp line
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
    print(f"✅ Successfully parsed {len(parsed_blocks)} subtitle blocks from SRT.")
    return parsed_blocks

def create_sample_srt(path):
    sample = (
        "1\\n"
        "00:00:01,000 --> 00:00:04,500\\n"
        "In the shadows of the digital frontier, we build the future.\\n\\n"
        "2\\n"
        "00:00:05,200 --> 00:00:09,800\\n"
        "Unseen streams of raw binary code pulse through deep subway server arrays.\\n\\n"
        "3\\n"
        "00:00:10,500 --> 00:00:15,000\\n"
        "Every node lights up in fuchsia neon, forging a state of the art neural link.\\n\\n"
        "4\\n"
        "00:00:15,600 --> 00:00:19,800\\n"
        "This is not a simulation. The hacker protocol has officially initiated.\\n"
    )
    with open(path, "w", encoding="utf-8") as f:
        f.write(sample)

# ==============================================================================
# 🤖 GEMINI VISUAL CONCEPT GENERATION (Requires google-genai SDK)
# ==============================================================================
def get_visual_keywords(subtitle_text):
    """Queries Gemini to generate 2-3 precise visual keywords for stock footage."""
    if not GEMINI_API_KEY:
        print("⚠️ Warning: GEMINI_API_KEY environment variable is missing!")
        print("Generating a fallback cyberpunk visual keyword locally...")
        return fallback_keyword_generator(subtitle_text)

    try:
        # Initialize the modern developer SDK
        client = genai.Client(api_key=GEMINI_API_KEY)
        
        prompt = (
            f"Given the dialogue sentence: \\"{subtitle_text}\\"\\n"
            "Generate exactly 2 to 3 precise visual search keywords / simple physical terms "
            "suitable for searching free stock video clips. Prioritize high-contrast techy hacker, "
            "neon, server racks, glowing cables, binary matrix, or dark cyberpunk visuals.\\n"
            "Return ONLY a comma-separated list of keywords. E.g. 'cyberpunk cyber neon, glowing matrix flow'."
        )

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.7,
                system_instruction="You are a filmmaker. Translate words into concrete visual descriptions for stock video engines."
            )
        )
        
        raw_text = response.text.strip().replace("\\n", "").replace('"', '')
        keywords = [k.strip() for k in raw_text.split(",") if k.strip()]
        if not keywords:
            return ["cyberpunk neon technology"]
        print(f"🤖 Gemini keywords for \\"{subtitle_text[:30]}...\\": {keywords}")
        return keywords
    except Exception as e:
        print(f"⚠️ Gemini API query failed: {e}. Utilizing offline keyword engine.")
        return fallback_keyword_generator(subtitle_text)

def fallback_keyword_generator(text):
    words = text.lower()
    if "shadow" in words or "hacker" in words or "frontier" in words:
        return ["hacking computer matrix", "cyber security terminal"]
    elif "binary" in words or "stream" in words or "code" in words:
        return ["fuchsia matrix code rain", "cyber coding stream"]
    elif "node" in words or "neon" in words or "neural" in words:
        return ["motherboard electricity pink", "glowing neon futuristic chip"]
    else:
        return ["cyberpunk abstract vector loop"]

# ==============================================================================
# 📹 STOCK FOOTAGE FETCHING WITH STRICT RESOLUTION CHECK
# ==============================================================================
def fetch_stock_video(keywords, is_vertical=False):
    """
    Queries Pexels API; parses response, strictly extracts and downloads 
    the 1080p (Full HD) resolution variant of the matching clip.
    REJECTS 4K/2K (unneeded heavy files) and SD/low-res clips.
    """
    if not PEXELS_API_KEY:
        print("⚠️ Warning: PEXELS_API_KEY is not defined. Using beautiful cyberpunk fallback loops...")
        return FALLBACK_VIDEO_VERT if is_vertical else FALLBACK_VIDEO_HORIZ

    headers = {"Authorization": PEXELS_API_KEY}
    
    # Try keywords sequentially
    for query in keywords:
        url = f"https://api.pexels.com/videos/search?query={requests.utils.quote(query)}&per_page=5"
        try:
            r = requests.get(url, headers=headers, timeout=12)
            if r.status_code != 200:
                continue
            
            data = r.json()
            videos = data.get("videos", [])
            if not videos:
                continue

            for vid in videos:
                vid_width = vid.get("width", 1920)
                vid_height = vid.get("height", 1080)
                is_clip_vertical = vid_width < vid_height

                # Ensure orientation matches our target
                if is_clip_vertical != is_vertical:
                    continue

                video_files = vid.get("video_files", [])
                
                # STRICT RESOLUTION SEARCH: Look for 1080p Full HD
                # (1920x1080 for Horizontal OR 1080x1920 for Vertical)
                for file_entry in video_files:
                    target_w = 1080 if is_vertical else 1920
                    target_h = 1920 if is_vertical else 1080
                    
                    # Strictly check file resolution matches Full HD 1080p
                    if file_entry.get("width") == target_w or file_entry.get("height") == target_h:
                        download_url = file_entry.get("link")
                        print(f"🎯 Strict 1080p variant found: {vid_width}x{vid_height} on Pexels. URL: {download_url[:60]}...")
                        return download_url

                # Secondary fallback: If exact 1080p isn't declared, try HD (720p to 1080p) and reject 4K
                for file_entry in video_files:
                    f_h = file_entry.get("height", 1080)
                    f_w = file_entry.get("width", 1920)
                    
                    # Rejects UHD/4K (usually > 2160h or > 3840w) and rejects low-quality SD (< 540h)
                    is_reasonable_hd = (540 <= f_h <= 1080) if not is_vertical else (540 <= f_w <= 1080)
                    if is_reasonable_hd:
                        download_url = file_entry.get("link")
                        print(f"👍 Found acceptable High-Def ({f_w}x{f_h}) file download. Rejecting UltraHD.")
                        return download_url

        except Exception as e:
            print(f"⚠️ Search error for keyword \\"{query}\\": {e}")
            continue

    # Setup smart fallbacks
    print("🛸 Smart Fallback activated: Requested keyword returned no immediate stock results or 1080p files.")
    return FALLBACK_VIDEO_VERT if is_vertical else FALLBACK_VIDEO_HORIZ

def download_file(url, local_filename):
    """Downloads streaming binary to local destination file."""
    os.makedirs(os.path.dirname(local_filename), exist_ok=True)
    print(f"📥 Downloading stock asset source to: {local_filename}")
    try:
        with requests.get(url, stream=True, timeout=30) as r:
            r.raise_for_status()
            with open(local_filename, "wb") as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)
        print("✅ Download Complete.")
        return True
    except Exception as e:
        print(f"❌ Failed to download segment from URL: {e}")
        return False

# ==============================================================================
# 🎬 VIDEO PROCESSING & TIMELINE STITCHING
# ==============================================================================
def compile_automation():
    print("🚀 Initializing Video Creation Timeline Engine...")
    
    # 1. Parse subtitles
    blocks = parse_srt(SRT_PATH)
    if not blocks:
        print("❌ No subtitle blocks compiled. Exiting pipeline.")
        return False

    # 2. Check for input audio
    if not os.path.exists(AUDIO_PATH):
        print(f"❌ Input Audio track was not located at: {AUDIO_PATH}")
        print("Please supply an input .mp3 or .wav sound file.")
        
        # We will create a silent placeholder track so the moviepy script executes for demonstration
        print("Creating placeholder audio track using MoviePy synth generator...")
        generate_fallback_audio(AUDIO_PATH, duration=blocks[-1]["end"] + 1)

    # 3. Create cleanup directories
    if os.path.exists(TEMP_DIR):
        shutil.rmtree(TEMP_DIR)
    os.makedirs(TEMP_DIR, exist_ok=True)

    video_segments = []

    # 4. Fetch and download assets for each timestamp block
    for idx, block in enumerate(blocks):
        print(f"\\n--- Processing Subtitle Block {block['id']}/{len(blocks)} ---")
        print(f"Dialogue: \\"{block['text']}\\"")
        print(f"Duration Target: {block['duration']}s [{block['start']}s --> {block['end']}s]")

        # Execute Gemini Keyword Concept engine
        keywords = get_visual_keywords(block["text"])
        
        # Fetch 1080p URL
        video_url = fetch_stock_video(keywords, is_vertical=IS_VERTICAL)
        
        # Download segment
        local_clip_path = os.path.join(TEMP_DIR, f"clip_{block['id']}.mp4")
        success = download_file(video_url, local_clip_path)
        
        if not success:
            print("Downloading failed. Defaulting to general cyberpunk online visual backup...")
            backup_url = FALLBACK_VIDEO_VERT if IS_VERTICAL else FALLBACK_VIDEO_HORIZ
            download_file(backup_url, local_clip_path)

        # Build MoviePy Clip
        try:
            # Load clip, mute original track fully
            clip = VideoFileClip(local_clip_path).without_audio()
            
            # Crop to matching aspect ratio if necessary
            # Pexels orientation checks usually catch this, but double check
            c_w, c_h = clip.w, clip.h
            if IS_VERTICAL and c_w > c_h:
                # Need to crop horizontal to vertical
                new_w = int(c_h * (9/16))
                x_center = c_w // 2
                clip = clip.crop(x1=x_center - new_w//2, y1=0, x2=x_center + new_w//2, y2=c_h)
            elif not IS_VERTICAL and c_h > c_w:
                # Need to crop vertical to horizontal
                new_h = int(c_w * (9/16))
                y_center = c_h // 2
                clip = clip.crop(x1=0, y1=y_center - new_h//2, x2=c_w, y2=y_center + new_h//2)

            # Resize standard dimensions to perfect 1080p
            target_w = 1080 if IS_VERTICAL else 1920
            target_h = 1920 if IS_VERTICAL else 1080
            clip = clip.resize(newsize=(target_w, target_h))

            # Trim or Loop clip to EXACT duration
            target_dur = block["duration"]
            if clip.duration < target_dur:
                print(f"⚠️ Stock clip duration ({clip.duration}s) is shorter than target block ({target_dur}s). Looping clip...")
                clip = vfx.loop(clip, duration=target_dur)
            else:
                print(f"✂️ Trimming stock clip from 0 to {target_dur}s...")
                clip = clip.subclip(0, target_dur)

            # Assign timeline starts
            clip = clip.set_start(block["start"])
            
            # The SRT timestamps are strictly used for timing and alignment.
            # No subtitle text is overlayed or burned on the final compiled video.
            video_segments.append(clip)

        except Exception as clip_err:
            print(f"❌ Failed to process video track element for block {block['id']}: {clip_err}")
            continue

    if not video_segments:
        print("❌ Compiled timeline contains 0 valid video segments.")
        return False

    # 5. Stitch clips sequentially & load full track audio overlay
    print("\\n🔗 Constructing complete timeline sequence...")
    final_video = concatenate_videoclips(video_segments, method="compose")
    
    try:
        audio_overlay = AudioFileClip(AUDIO_PATH)
        # Limit audio duration to length of the video sequence
        if audio_overlay.duration > final_video.duration:
            audio_overlay = audio_overlay.subclip(0, final_video.duration)
        final_video = final_video.set_audio(audio_overlay)
        print("🎵 Audio Overlay track attached successfully.")
    except Exception as aud_err:
        print(f"⚠️ Could not load audio overlay: {aud_err}. Exporting video clip as silent timeline.")

    # 6. Export Final Video file in Full HD
    print(f"\\n🎞️ Rendering output assembly to: {OUTPUT_VIDEO_PATH}")
    try:
        # standard 24fps export
        final_video.write_videofile(
            OUTPUT_VIDEO_PATH,
            fps=24,
            codec="libx264",
            audio_codec="aac",
            temp_audiofile="temp-audio.m4a",
            remove_temp=True,
            threads=4
        )
        print("\\n🌟 SUCCESS! Production-ready video exported successfully!")
        
        # Close handles
        final_video.close()
        
        # 7. Cleanup temp files
        cleanup_temp()
        return True
    except Exception as render_err:
        print(f"❌ Automation build failed on final video render write cycle: {render_err}")
        return False

def generate_fallback_audio(path, duration):
    try:
        from moviepy.audio.AudioClip import AudioClip
        import math
        # Generate a beautiful soft synth drone wave at 440hz
        make_frame = lambda t: [math.sin(2 * math.pi * 440 * t)]
        clip = AudioClip(make_frame, duration=duration, fps=44100)
        clip.write_audiofile(path, fps=44100, nbytes=2, codec="mp3")
        print(f"Created a synthetic techno sound-drone (.mp3) track at: {path}")
    except Exception as e:
        # Write minimal blank file if clip writing fails
        print("Creating an empty silent file as sound fallback...")
        with open(path, "wb") as f:
            f.write(b"")

def cleanup_temp():
    """Wipes all downloaded stock media snippets and cleans active workspace."""
    if os.path.exists(TEMP_DIR):
        print(f"🧹 Scrubbing temp folders: Removing {TEMP_DIR}")
        try:
            shutil.rmtree(TEMP_DIR)
            print("✨ Subtitle block clip snippets clean-up complete.")
        except Exception as e:
            print(f"⚠️ Failed to delete temp directory: {e}")

if __name__ == "__main__":
    # Standard terminal entrypoint
    print("--- Matrix Video Synthesizer Activated ---")
    
    # Prompt keys warning if unspecified
    if not GEMINI_API_KEY:
        print("🔑 ENV NOTICE: 'GEMINI_API_KEY' not found in environment. Relying on local keyword logic.")
    if not PEXELS_API_KEY:
        print("🔑 ENV NOTICE: 'PEXELS_API_KEY' not found in environment. Defaulting to pre-selected cyberpunk clips.")
        
    compile_automation()
`;
};

export const getStreamlitScript = (): string => {
  return `import os
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

# Try fetching Gemini SDK components
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

# Try MoviePy imports
try:
    from moviepy.editor import VideoFileClip, AudioFileClip, TextClip, CompositeVideoClip, concatenate_videoclips, vfx
except ImportError:
    try:
         from moviepy import VideoFileClip, AudioFileClip, TextClip, CompositeVideoClip, concatenate_videoclips, vfx
    except ImportError:
         pass # Handled inside validation step safely before running

# ==============================================================================
# 🧩 HELPER FUNCTIONS & BUSINESS LOGIC
# ==============================================================================

def parse_timecode(timecode):
    """Converts standard SRT time stamp (e.g., '00:00:02,120' or '00:00:02.120') to float seconds."""
    parts = timecode.replace(",", ".").split(":")
    hours = float(parts[0])
    minutes = float(parts[1])
    seconds = float(parts[2])
    return hours * 3600 + minutes * 60 + seconds

def parse_srt_string(srt_content):
    """Parses an .srt file content to yield subtitle blocks with timestamps and text."""
    blocks = re.split(r'\\n\\s*\\n', srt_content.strip())
    parsed_blocks = []
    
    time_pattern = r"(\\d{2}:\\d{2}:\\d{2}[,.]\\d{3})\\s*-->\\s*(\\d{2}:\\d{2}:\\d{2}[,.]\\d{3})"
    
    for block in blocks:
        lines = [line.strip() for line in block.split('\\n') if line.strip()]
        if len(lines) < 2:
            continue
        
        # Locate the timestamp line
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
    """Leverages the Gemini Generative AI Model to find rich stock footage search tags."""
    if not gemini_api_key:
        return [clean_keyword(block_text)]
        
    prompt = f\"\"\"
    You are a video editor and cinematographer selecting high-quality B-roll stock video concepts.
    Analyze the following narration segment and output EXACTLY one highly descriptive cinematic B-roll concept search keyword term (1-3 words max).
    The term should specify visual content suitable for a standard stock library such as Pexels or Pixabay (e.g. 'cyberpunk programmer typing', 'neon highway time lapse', 'foggy futuristic metropolis').
    Do NOT output punctuation, numbers, titles, explanations, or quotes. Output ONLY the plain search term.
    
    Narration Segment: "{block_text}"
    \"\"\"
    
    try:
        if NEW_SDK_AVAILABLE:
            # Using new Google GenAI SDK
            client = genai.Client(api_key=gemini_api_key)
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
                config=types.GenerateContentConfig(temperature=0.4, max_output_tokens=15)
            )
            term = response.text.strip().replace('"', '').replace('.', '')
            return [term] if term else [clean_keyword(block_text)]
        else:
            # Using legacy SDK fallback
            genai_legacy.configure(api_key=gemini_api_key)
            model = genai_legacy.GenerativeModel('gemini-1.5-flash')
            response = model.generate_content(prompt)
            term = response.text.strip().replace('"', '').replace('.', '')
            return [term] if term else [clean_keyword(block_text)]
    except Exception as e:
        # Fallback to noun phrases or direct cleaning
        return [clean_keyword(block_text)]

def clean_keyword(text):
    """Filters noisy symbols and builds a clean 2-word search term out of the dialogue block."""
    clean = re.sub(r'[^a-zA-Z\\s]', '', text).strip()
    words = [w for w in clean.split() if len(w) > 3]
    if len(words) >= 2:
        return " ".join(words[:2]).lower()
    elif len(words) == 1:
        return words[0].lower()
    return "cyberpunk technology"

def fetch_pexels_video_url(search_term, pexels_key, is_vertical=True):
    """Interacts with the Pexels HTTP API to extract FullHD (1080p) video clip streams."""
    if not pexels_key:
        return None
        
    headers = {"Authorization": pexels_key}
    # Restrict to HD size requests to keep buffers fast and optimal
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
                
                # Filter files: Avoid ultra heavy 4K streams
                for f in video_files:
                    w = f.get("width") or 0
                    h = f.get("height") or 0
                    link = f.get("link")
                    if link and (w == target_dimension or h == target_dimension):
                        return link
                
                # If exact 1080 match not encountered, look for the closest HD or standard mp4 link
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

    # Sidebar settings
    st.sidebar.markdown('<h3 style="color: #D10068; text-shadow: 0 0 8px rgba(209, 0, 104, 0.4);">⚙️ Pipeline Settings</h3>', unsafe_allow_html=True)
    
    # 1. API Keys Secure password style
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

    # 2. Aspect Ratio Settings
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

    # 3. Subtitle Render Overlay choice
    st.sidebar.markdown("<br>", unsafe_allow_html=True)
    st.sidebar.markdown("##### 💬 Text Subtitle Rendering")
    subtitle_render_mode = st.sidebar.selectbox(
        "Select Subtitle overlay action:",
        options=[
            "None (Strictly Audio Overlay ONLY & Timing Alignment)", 
            "Burn Subtitles (Fuchsia-shadow neon caption cards)"
        ],
        index=0,
        help="Choose whether to visually draw/compile subtitle text overlayed on top of your final video compilation."
    )
    is_burn_subtitles = "Burn Subtitles" in subtitle_render_mode

    # Main dashboard file uploaders
    st.markdown("### 🗂️ Step 1: Upload Workspace Assets")
    
    col1, col2 = st.columns(2)
    
    with col1:
        st.markdown("**1. Narration Subtitle Sequence (.srt)**")
        srt_file = st.file_uploader(
            "Upload SRT subtitle timeline file",
            type=["srt"],
            label_visibility="collapsed"
        )
        if srt_file:
            st.success("✓ SRT File uploaded successfully!")
            
    with col2:
        st.markdown("**2. Custom Background Audio Track (.mp3, .wav)**")
        audio_file = st.file_uploader(
            "Upload background MP3/WAV narration sound track",
            type=["mp3", "wav"],
            label_visibility="collapsed"
        )
        if audio_file:
            st.success("✓ Audio File uploaded successfully!")

    # Display SRT parsed blocks preview
    parsed_blocks = []
    if srt_file:
        try:
            srt_content = srt_file.getvalue().decode("utf-8")
            parsed_blocks = parse_srt_string(srt_content)
            
            st.markdown("<br>", unsafe_allow_html=True)
            with st.expander(f"🔎 Parsed SRT Preview ({len(parsed_blocks)} Timeline Blocks Resolved)", expanded=False):
                for b in parsed_blocks:
                    st.markdown(f"**Block #{b['id']}** \`[{b['start']:.2f}s -> {b['end']:.2f}s]\` &mdash; *\\"{b['text']}\\"*")
        except Exception as e:
            st.error(f"❌ Could not parse uploaded SRT subtitles: {e}")

    # Render triggers
    st.markdown("<br>", unsafe_allow_html=True)
    st.markdown("### 🛠️ Step 2: Render Automation Control Deck")
    
    assets_missing = not srt_file or not audio_file
    
    if assets_missing:
        st.warning("📥 Critical blocks missing: Please upload both '.srt' and '.mp3' sound track to arm generators.")

    trigger_btn = st.button(
        "🎬 Generate Video Pipeline", 
        disabled=assets_missing,
        use_container_width=True
    )

    if trigger_btn:
        progress_bar = st.progress(0)
        status_text = st.empty()
        log_box = st.empty()
        
        logs = []
        def append_log(text, log_type="info"):
            prefix = "[INFO]" if log_type == "info" else ("[SUCCESS]" if log_type == "success" else "[ERROR]")
            logs.append(f"{prefix} {text}")
            log_box.code("\\n".join(logs), language="bash")

        status_text.text("Verifying system dependencies...")
        progress_bar.progress(10)
        append_log("Starting compilation process sequence in workspace engine...", "info")
        
        try:
             import moviepy
             append_log(f"MoviePy library verified: version {moviepy.__version__}", "info")
        except ImportError:
             st.error("❌ Critical Library Error: MoviePy package is not installed on this server instance.")
             return

        temp_dir = tempfile.mkdtemp()
        append_log(f"Workspace isolated sandbox initialized at: {temp_dir}", "info")
        
        try:
            progress_bar.progress(20)
            status_text.text("Copying workspace uploaded inputs into sandbox...")
            
            temp_audio_path = os.path.join(temp_dir, "input_audio.mp3")
            with open(temp_audio_path, "wb") as f_aud:
                f_aud.write(audio_file.getvalue())
            append_log(f"Narration background audio track parsed and captured.", "success")
            
            status_text.text("Analyzing transcription concepts via Gemini AI API...")
            progress_bar.progress(35)
            
            if gemini_api_key:
                append_log("Activating Gemini model framework: query optimization triggered...", "info")
            else:
                append_log("Gemini API key is blank. Resorting to fallback tokenizations...", "info")

            segment_videos = []
            fallback_video_url = "https://videos.pexels.com/video-files/5198159/5198159-uhd_1080_1920_25fps.mp4" if is_vertical else "https://videos.pexels.com/video-files/3129957/3129957-uhd_1920_1080_25fps.mp4"
            
            for idx, block in enumerate(parsed_blocks):
                status_text.text(f"Processing subtitle cut segment {idx+1}/{len(parsed_blocks)}...")
                append_log(f"Segment #{block['id']} ({block['duration']:.1f}s): {block['text'][:45]}...", "info")
                
                keywords = get_gemini_keywords(block["text"], gemini_api_key)
                search_query = keywords[0] if keywords else clean_keyword(block["text"])
                append_log(f" └─ Resolved cinematic key tag: \\"{search_query}\\"", "info")
                
                video_url = None
                if pexels_api_key:
                    video_url = fetch_pexels_video_url(search_query, pexels_api_key, is_vertical)
                    if video_url:
                        append_log(f" └─ Successfully located stock B-roll video clip URL on Pexels.", "success")
                
                if not video_url:
                    video_url = fallback_video_url
                    
                dest_file_name = f"segment_clip_{block['id']}.mp4"
                dest_path = os.path.join(temp_dir, dest_file_name)
                
                append_log(f" └─ Downloading stream clip {block['id']} to sandbox array...", "info")
                r = requests.get(video_url, stream=True, timeout=15)
                if r.status_code == 200:
                    with open(dest_path, 'wb') as f_vid:
                        shutil.copyfileobj(r.raw, f_vid)
                    append_log(f" └─ Saved block segment buffer size: {os.path.getsize(dest_path)/1024/1024:.2f} MB", "success")
                else:
                    st.error("Could not retrieve stock loop clip.")
                    return
                
                segment_videos.append({
                    "block_id": block["id"],
                    "path": dest_path,
                    "start": block["start"],
                    "duration": block["duration"],
                    "text": block["text"]
                })

            status_text.text("Structuring MoviePy Timeline assembly...")
            progress_bar.progress(60)
            append_log("Executing MoviePy core stitching, looping, and resolution alignment...", "info")
            
            video_clips_array = []
            
            for item in segment_videos:
                clip = VideoFileClip(item["path"]).without_audio()
                
                if clip.duration < item["duration"]:
                    clip = clip.loop(duration=item["duration"])
                else:
                    clip = clip.subclip(0, item["duration"])
                
                clip_w, clip_h = clip.size
                scale_factor = max(target_width / clip_w, target_height / clip_h)
                
                clip = clip.resize(scale_factor)
                new_w, new_h = clip.size
                
                x_center = (new_w - target_width) / 2
                y_center = (new_h - target_height) / 2
                clip = clip.crop(
                    x1=x_center, 
                    y1=y_center, 
                    x2=x_center + target_width, 
                    y2=y_center + target_height
                )
                
                append_log(f" ├─ Processed clip {item['block_id']}: Resized/Cropped to {target_width}x{target_height}", "info")
                
                if is_burn_subtitles:
                    try:
                        fs = 36 if is_vertical else 44
                        txt_clip = TextClip(
                            item["text"], 
                            fontsize=fs, 
                            color="white", 
                            font="Courier-Bold",
                            stroke_color="black",
                            stroke_width=2.5,
                            method="caption",
                            size=(target_width - 100, None)
                        )
                        txt_clip = txt_clip.set_position(("center", target_height - 180)).set_duration(item["duration"])
                        composite_segment = CompositeVideoClip([clip, txt_clip], size=(target_width, target_height))
                        composite_segment = composite_segment.set_duration(item["duration"])
                        video_clips_array.append(composite_segment)
                    except Exception as srt_err:
                        append_log(f" │  └─ TextClip failed: {srt_err}", "warning")
                        video_clips_array.append(clip)
                else:
                    video_clips_array.append(clip)

            status_text.text("Merging tracks and encoding MoviePy final layer...")
            progress_bar.progress(80)
            
            final_composite_video = concatenate_videoclips(video_clips_array, method="compose")
            
            try:
                audio_overlay = AudioFileClip(temp_audio_path)
                if audio_overlay.duration > final_composite_video.duration:
                    audio_overlay = audio_overlay.subclip(0, final_composite_video.duration)
                final_composite_video = final_composite_video.set_audio(audio_overlay)
                append_log("Sound track master channel overlay aligned and synced.", "success")
            except Exception as aud_err:
                append_log(f"Could not synthesize sound alignment: {aud_err}.", "warning")

            final_output_path = os.path.join(temp_dir, "final_iris_output.mp4")
            status_text.text("Rendering final movie frame trace sequence (24fps H.264 AAC)...")
            
            final_composite_video.write_videofile(
                final_output_path,
                fps=24,
                codec="libx264",
                audio_codec="aac",
                temp_audiofile=os.path.join(temp_dir, "temp-audio.m4a"),
                remove_temp=True,
                threads=4
            )
            
            progress_bar.progress(100)
            status_text.text("Compilation successfully completed!")
            append_log("🌟 RENDER TIMELINE TERMINATED SUCCESSFULLY!", "success")
            
            with open(final_output_path, "rb") as f_out:
                final_bytes = f_out.read()

            final_composite_video.close()
            
            st.markdown("---")
            st.markdown("<h3 style='color: #D10068;'>🎉 Generated Video Output Room</h3>", unsafe_allow_html=True)
            st.video(final_output_path)
            st.download_button(
                label="💾 Download Processed MP4",
                data=final_bytes,
                file_name="iris_final_video.mp4",
                mime="video/mp4"
            )

        except Exception as pipeline_err:
            st.error(f"❌ Critical Pipeline Failure: {pipeline_err}")
        finally:
            try:
                shutil.rmtree(temp_dir)
            except Exception:
                pass

if __name__ == "__main__":
    main()`;
};

// Complete prefilled mockup of audio track beats for the simulated preview
// Plays when the user hits "Run Script Simulator".
export const CYBERPUNK_SYNTH_TRACK = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";

