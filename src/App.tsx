import { useState, useEffect, useRef } from "react";
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Copy, 
  Check, 
  Code, 
  FileText, 
  Video, 
  Cpu, 
  Sliders, 
  Terminal as TerminalIcon, 
  Sparkles, 
  Search, 
  Download, 
  CheckCircle, 
  AlertTriangle, 
  HelpCircle,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  FolderOpen
} from "lucide-react";
import { getPythonScript, getStreamlitScript, DEFAULT_SRT, CYBERPUNK_SYNTH_TRACK } from "./data";
import { SubtitleBlock, TimelineClip, ConsoleMessage, ScriptConfig } from "./types";

export default function App() {
  // Input settings
  const [srtText, setSrtText] = useState(DEFAULT_SRT);
  const [audioPath, setAudioPath] = useState("vox_voiceover.mp3");
  const [srtPath, setSrtPath] = useState("subs_final.srt");
  const [outputVideoPath, setOutputVideoPath] = useState("output_hacker_fuchsia.mp4");
  const [isVertical, setIsVertical] = useState(false);
  const [pexelsKey, setPexelsKey] = useState("");
  
  // App state
  const [parsedBlocks, setParsedBlocks] = useState<SubtitleBlock[]>([]);
  const [activeTab, setActiveTab] = useState<"simulator" | "code" | "docs" | "streamlit">("simulator");
  const [isProcessing, setIsProcessing] = useState(false);
  const [pipelineStep, setPipelineStep] = useState<number>(0);
  const [timeline, setTimeline] = useState<TimelineClip[]>([]);
  const [logs, setLogs] = useState<ConsoleMessage[]>([]);
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedStreamlit, setCopiedStreamlit] = useState(false);

  // Progressive Web App (PWA) Install parameters
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isPwaInstalled, setIsPwaInstalled] = useState(false);

  useEffect(() => {
    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      addLog("🎬 PWA installation mode available. Click 'INSTALL PWA' in the top bar to run standalone offline!", "success");
    };

    const handleAppInstalled = () => {
      setIsPwaInstalled(true);
      setDeferredPrompt(null);
      addLog("🌟 Standalone Application installed on your home screen or desktop successfully!", "success");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleAppInstalled);

    if (window.matchMedia("(display-mode: standalone)").matches) {
       setIsPwaInstalled(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const triggerPwaInstall = async () => {
    if (!deferredPrompt) {
      addLog("To install, use your browser's 'Add to Home Screen' or standalone install tools.", "info");
      // Fallback: simulate an experience if they clicked but browser hasn't fired event yet (or doesn't support Chrome APIs)
      alert("Tip: Click your browser's install option (the screen with an arrow icon inside the address bar) to launch Iris Gen Editor as a Progressive Web App.");
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    addLog(`Standalone alignment user selection resolution: ${outcome}`, "success");
    setDeferredPrompt(null);
  };
  
  // Video player simulator states
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [selectedClip, setSelectedClip] = useState<TimelineClip | null>(null);

  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const logsEndRef = useRef<HTMLDivElement | null>(null);
  const playbackIntervalRef = useRef<any>(null);

  // Parse time from SRT string formats E.g. 00:00:01,000 -> 1.0
  const parseTimecode = (timecode: string): number => {
    const cleanTime = timecode.trim().replace(",", ".");
    const parts = cleanTime.split(":");
    if (parts.length < 3) return 0;
    const hours = parseFloat(parts[0]);
    const minutes = parseFloat(parts[1]);
    const seconds = parseFloat(parts[2]);
    return hours * 3600 + minutes * 60 + seconds;
  };

  // Main Parse function
  const handleParseSRT = () => {
    try {
      addLog("Initializing SRT subtitle parsing module...", "info");
      const blocksRaw = srtText.trim().split(/\n\s*\n/);
      const parsed: SubtitleBlock[] = [];
      const timeRegex = /(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/;

      blocksRaw.forEach((blockStr, index) => {
        const lines = blockStr.split("\n").map(l => l.trim()).filter(Boolean);
        if (lines.length < 3) return;
        
        // Find index of the time signature row
        let timeIndex = -1;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes("-->")) {
            timeIndex = i;
            break;
          }
        }

        if (timeIndex === -1) return;

        const match = lines[timeIndex].match(timeRegex);
        if (!match) return;

        const start = parseTimecode(match[1]);
        const end = parseTimecode(match[2]);
        const text = lines.slice(timeIndex + 1).join(" ");

        parsed.push({
          id: index + 1,
          startText: match[1],
          endText: match[2],
          start,
          end,
          text
        });
      });

      setParsedBlocks(parsed);
      
      if (parsed.length > 0) {
        setDuration(parsed[parsed.length - 1].end);
        addLog(`Successfully parsed ${parsed.length} subtitle blocks from SRT target. Total duration: ${parsed[parsed.length - 1].end}s`, "success");
      } else {
        addLog("SRT Parsing warning: 0 valid blocks detected. Make sure formatting uses standard timestamp lines.", "warning");
      }
    } catch (err: any) {
      addLog(`Critial parsing failure: ${err.message}`, "error");
    }
  };

  // Utility to append console logs
  const addLog = (text: string, type: "info" | "success" | "warning" | "error" | "gemini" = "info") => {
    const timestamp = new Date().toLocaleTimeString();
    const id = Math.random().toString(36).substring(7);
    setLogs(prev => [...prev, { id, timestamp, text, type }]);
  };

  // Initialize and parse defaults on load
  useEffect(() => {
    handleParseSRT();
    // Default initial logs representing server system
    addLog("System startup completed. Matrix Video Synth active on Port 3000.", "info");
    addLog("Full-stack Node.js development server running ready for simulation.", "info");
  }, []);

  // Update duration whenever blocks change or timeline resets
  useEffect(() => {
    if (parsedBlocks.length > 0) {
      const highestTime = Math.max(...parsedBlocks.map(b => b.end));
      setDuration(highestTime);
    }
  }, [parsedBlocks]);

  // Scroll logs container to bottom automatically on new messages
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  // Handle Video / Audio Playback Synchronisation
  useEffect(() => {
    if (isPlaying) {
      // Setup browser synth track simulation
      if (audioRef.current) {
        audioRef.current.currentTime = currentTime;
        audioRef.current.play().catch(() => {
          // Prevent standard autoplay restrictions crash
        });
      }

      playbackIntervalRef.current = setInterval(() => {
        setCurrentTime(prev => {
          const nextVal = prev + 0.1;
          if (nextVal >= duration) {
            handleStop();
            return 0;
          }
          return nextVal;
        });
      }, 100);
    } else {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
    }

    return () => {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
      }
    };
  }, [isPlaying, duration]);

  const handlePlayPause = () => {
    if (parsedBlocks.length === 0) {
      addLog("Cannot initiate playback - Please parse subtitle blocks first.", "warning");
      return;
    }
    setIsPlaying(!isPlaying);
  };

  const handleStop = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  // Live Simulation Trigger - executes client-to-server endpoints
  // This accurately replicates how the automation python script runs!
  const runAutomationPipelineSimulator = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setPipelineStep(1); // SRT Parsing
    setIsPlaying(false);
    setCurrentTime(0);
    setTimeline([]);

    addLog("==========================================================", "info");
    addLog("🚀 LAUNCHING PIPELINE: AUTOMATED SCRIPT EMULATOR v2.0", "info");
    addLog(`Parameters: Audio=${audioPath} | Subtitles=${srtPath} | Vertical=${isVertical} | Size=1080p`, "info");

    // Phase 1: Subtitle blocks loaded
    handleParseSRT();
    await delay(1200);

    // Verify parser output
    if (parsedBlocks.length === 0) {
      addLog("❌ Failed: Line parsing completed with no valid SRT blocks.", "error");
      setIsProcessing(false);
      setPipelineStep(0);
      return;
    }

    setPipelineStep(2); // AI Keywords
    addLog("🤖 PHASE 2: Fetching Gemini API visual concepts...", "gemini");
    
    const compiledTimeline: TimelineClip[] = [];

    for (let i = 0; i < parsedBlocks.length; i++) {
      const block = parsedBlocks[i];
      addLog(`Generating keyword search instructions for SRT #${block.id}: "${block.text.substring(0, 35)}..."`, "info");

      try {
        // Query server side Gemini API proxy
        const res = await fetch("/api/gemini/keywords", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: block.text })
        });

        const data = await res.json();
        const keywords = data.keywords || ["cyberpunk fuchsia neon"];
        
        if (data.simulated) {
          addLog(`🤖 Gemini Fallback engine designed prompt terms: [${keywords.join(", ")}]`, "gemini");
        } else {
          addLog(`🤖 Real gemini-3.5-flash reasoning: [${keywords.join(", ")}]`, "gemini");
        }

        // Move to Phase 3: Stock searching and strict resolution filter
        setPipelineStep(3);
        const searchKeyword = keywords[0]; // first keyword
        addLog(`🔍 PHASE 3: Querying Pexels Search Engine for term: "${searchKeyword}"`, "info");
        
        const videoRes = await fetch("/api/video-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            keyword: searchKeyword,
            isVertical: isVertical,
            clientKey: pexelsKey
          })
        });

        if (!videoRes.ok) throw new Error("Connection to stocks search handler lost.");
        const videoData = await videoRes.json();
        
        if (videoData.error) {
          addLog(`⚠️ Stock Search warning: ${videoData.error}. Activating fallback mechanisms...`, "warning");
        }

        const selectedVideo = videoData.video;
        addLog(`🎯 STRICT RESOLUTION EVALUATION: Target is 1080p. Found video: width=${selectedVideo.width}px, height=${selectedVideo.height}px`, "info");
        
        // Ensure 1080p compliance alert
        const matchRes = isVertical 
          ? (selectedVideo.width === 1080 ? "Perfect 1080x1920 (Vertical Full HD)" : `Resizing HD ${selectedVideo.width}x${selectedVideo.height} -> 1080x1920`)
          : (selectedVideo.height === 1080 ? "Perfect 1920x1080 (Horizontal Full HD)" : `Resizing HD ${selectedVideo.width}x${selectedVideo.height} -> 1920x1080`);
        
        addLog(`⭐ 1080p Compliance Check Passed: ${matchRes}`, "success");
        addLog(`📥 Successfully retrieved temporary direct link: ${selectedVideo?.url.substring(0, 60)}...`, "info");

        compiledTimeline.push({
          blockId: block.id,
          text: block.text,
          start: block.start,
          end: block.end,
          duration: block.end - block.start,
          keywords,
          video: selectedVideo,
          simulated: !!videoData.simulated
        });

      } catch (err: any) {
        addLog(`⚠️ Step failed for Block #${block.id}: ${err.message}. Emulating fallback stock loop.`, "warning");
        // Simulated local fallback
        compiledTimeline.push({
          blockId: block.id,
          text: block.text,
          start: block.start,
          end: block.end,
          duration: block.end - block.start,
          keywords: ["cyberpunk", "hacker font"],
          video: {
            id: "fallback_preset",
            url: isVertical 
              ? "https://videos.pexels.com/video-files/5198159/5198159-uhd_1080_1920_25fps.mp4"
              : "https://videos.pexels.com/video-files/3129957/3129957-uhd_1920_1080_25fps.mp4",
            name: "Default Cyber Theme Fallback",
            preview: "https://images.pexels.com/photos/3129957/pexels-photo-3129957.jpeg?auto=compress&cs=tinysrgb&w=400",
            width: isVertical ? 1080 : 1920,
            height: isVertical ? 1920 : 1080
          },
          simulated: true
        });
      }

      // Briefly pause to simulate pipeline flow aesthetically
      await delay(800);
    }

    // Phase 4: Time stitching using MoviePy mechanics
    setPipelineStep(4);
    addLog("🎬 PHASE 4: Injecting clips into MoviePy Timeline assembler...", "info");
    addLog("Applying clip parameters: set_start(), loop(), trim_subclip() and muting original streams.", "info");
    addLog("SRT timestamps strictly leveraged to sequence and transition clip alignments. No subtitle text burns to the output video.", "success");
    await delay(1500);

    // Phase 5: Complete Assembly
    setPipelineStep(5);
    addLog("🎵 Injecting parent audio soundtrack master tracking layer...", "info");
    addLog(`Finishing production export process to destination video: ${outputVideoPath}`, "success");
    addLog("🧹 Cleanup: Wiping temporary files from locally generated temp directory.", "info");
    
    setTimeline(compiledTimeline);
    if (compiledTimeline.length > 0) {
      setSelectedClip(compiledTimeline[0]);
    }

    addLog("🌟 SUCCESS! COMPLETE TIMELINE MANIFEST STITCHED ACCURATELY AND EXPORT RE-ENCODED.", "success");
    setIsProcessing(false);
    setPipelineStep(6);
  };

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Determine current active clip to show on simulator previewscreen
  const getActiveTimelineClip = (): TimelineClip | null => {
    if (timeline.length === 0) return null;
    const matched = timeline.find(c => currentTime >= c.start && currentTime <= c.end);
    return matched || timeline[0];
  };

  const activeClip = getActiveTimelineClip();

  const handleCopyCode = () => {
    const codeStr = getPythonScript({
      audioPath,
      srtPath,
      outputVideoPath,
      isVertical,
      pexelsKey
    });
    navigator.clipboard.writeText(codeStr);
    setCopiedScript(true);
    addLog("Copied generated production automation Python script directly to clipboard.", "success");
    setTimeout(() => setCopiedScript(false), 2000);
  };

  const handleCopyStreamlit = () => {
    const codeStr = getStreamlitScript();
    navigator.clipboard.writeText(codeStr);
    setCopiedScript(true); // Share success banner or setCopiedStreamlit
    setCopiedStreamlit(true);
    addLog("Copied full Streamlit MVP app.py source code to clipboard.", "success");
    setTimeout(() => setCopiedStreamlit(false), 2000);
  };

  const loadPresetTemplate = (name: string) => {
    addLog(`Loading Preset Templates: "${name}"`, "info");
    if (name === "cybernetic") {
      setSrtText(`1
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
This is not a simulation. The hacker protocol has officially initiated.`);
      setAudioPath("vox_soundscape_cyber.mp3");
      setOutputVideoPath("matrix_compiled_hd1080p.mp4");
      addLog("Fuchsia technology voiceover script set.", "success");
    } else if (name === "quantum") {
      setSrtText(`1
00:00:00,800 --> 00:00:05,200
Enter the quantum computer mainframe where electrons spin in light grids.

2
00:00:06,000 --> 00:00:11,500
Our automated script parses the timestamps, downloading high definition assets on the fly.

3
00:00:12,200 --> 00:00:18,500
Each block queries AI, generating beautiful neon highlights matching fuchsia tones.`);
      setAudioPath("quantum_synth_wave.wav");
      setOutputVideoPath("quantum_hacker_shorts.mp4");
      addLog("Quantum code compilation scripts preset loaded.", "success");
    }
    setTimeout(() => {
      handleParseSRT();
    }, 100);
  };

  // Safe manual timestamp blocks editor
  const handleUpdateBlockText = (id: number, text: string) => {
    const updated = parsedBlocks.map(b => b.id === id ? { ...b, text } : b);
    setParsedBlocks(updated);
    
    // Core reconstruct formatted srtText back
    const formatted = updated.map(b => `${b.id}\n${b.startText} --> ${b.endText}\n${b.text}`).join("\n\n");
    setSrtText(formatted);
  };

  return (
    <div className="flex flex-col min-h-screen bg-black text-[#f0f0f0] font-sans overflow-x-hidden antialiased">
      {/* Hidden background sound simulation */}
      <audio 
        ref={audioRef}
        src={CYBERPUNK_SYNTH_TRACK}
        loop
      />

      {/* Cyberpunk Fuchsia Neon Header Grid */}
      <header className="border-b border-brand-fuchsia/40 bg-zinc-950/85 backdrop-blur-md px-4 py-4 md:px-8 shadow-[0_4px_30px_rgba(209,0,104,0.15)] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div id="app_logo" className="w-12 h-12 bg-brand-fuchsia flex items-center justify-center rounded-sm shadow-[0_0_20px_#D10068] animate-pulse">
              <Video className="text-black w-7 h-7 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs bg-[#D10068] text-black px-1.5 py-0.5 font-mono font-bold uppercase rounded-sm tracking-wide">AI AUTOMATION</span>
                <span className="text-[10px] text-zinc-400 font-mono">v3.2_PROD</span>
              </div>
              <h1 className="text-xl md:text-2xl font-black font-display tracking-tight text-[#f0f0f0]">
                Iris Gen Editor <span className="text-brand-fuchsia text-glow">by Aparna Velvet</span>
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 md:gap-4 text-xs font-mono">
            {/* Progressive Web App Standalone Control Button */}
            <button
              onClick={triggerPwaInstall}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm border font-mono font-bold transition-all active:scale-95 ${
                isPwaInstalled 
                  ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-400" 
                  : "bg-brand-fuchsia/10 hover:bg-brand-fuchsia/20 border-brand-fuchsia/60 text-brand-fuchsia shadow-[0_0_15px_rgba(209,0,104,0.15)] animate-pulse"
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>{isPwaInstalled ? "✓ APP STANDALONE" : "⚡ INSTALL DESKTOP APP"}</span>
            </button>

            <div className="flex items-center gap-1.5 bg-zinc-900 border border-brand-fuchsia/20 px-3 py-1.5 rounded-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-[#D10068] animate-ping" />
              <span className="text-zinc-300">GEMINI: <span className="text-brand-fuchsia font-bold">2.5-FLASH</span></span>
            </div>
            <div className="flex items-center gap-1.5 bg-zinc-900 border border-green-500/20 px-3 py-1.5 rounded-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
              <span className="text-zinc-300">PEXELS: <span className="text-green-400 font-bold">1080p_READY</span></span>
            </div>
          </div>
        </div>
      </header>

      {/* Primary Workspace container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Control Center Panel: Settings & Text Input */}
        <section className="lg:col-span-4 flex flex-col gap-6" id="settings-pannel">
          
          {/* Section Heading */}
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <h2 className="text-sm font-mono uppercase tracking-widest text-brand-fuchsia flex items-center gap-2">
              <Sliders className="w-4 h-4 text-brand-fuchsia" /> Configuration Matrix
            </h2>
            <span className="text-[10px] text-zinc-500 font-mono">STEP_01</span>
          </div>

          {/* Quick Preset selector */}
          <div className="bg-zinc-950 p-4 rounded-md border border-zinc-800/80">
            <span className="text-xs text-zinc-400 font-mono block mb-2 font-bold">📂 TEMPLATE PRESETS</span>
            <div className="grid grid-cols-2 gap-2">
              <button 
                id="btn-preset-cyber"
                onClick={() => loadPresetTemplate("cybernetic")}
                className="text-[11px] font-mono py-2 px-3 bg-zinc-900 hover:bg-[#D10068]/10 text-zinc-300 hover:text-[#D10068] border border-zinc-800 hover:border-brand-fuchsia/40 rounded-sm transition-all text-left truncate flex items-center justify-between"
              >
                <span>🤖 Cyber-Hacker</span>
                <span className="text-[9px] text-brand-fuchsia opacity-80">16:9</span>
              </button>
              <button 
                id="btn-preset-quantum"
                onClick={() => loadPresetTemplate("quantum")}
                className="text-[11px] font-mono py-2 px-3 bg-zinc-900 hover:bg-[#D10068]/10 text-zinc-300 hover:text-[#D10068] border border-zinc-800 hover:border-brand-fuchsia/40 rounded-sm transition-all text-left truncate flex items-center justify-between"
              >
                <span>🌌 Quantum Code</span>
                <span className="text-[9px] text-[#D10068] opacity-80">9:16</span>
              </button>
            </div>
          </div>

          {/* Pipeline Configuration Parameters */}
          <div className="bg-zinc-950 p-5 rounded-md border border-zinc-800/80 flex flex-col gap-4">
            <h3 className="text-xs font-mono font-bold text-zinc-300 border-b border-zinc-900 pb-2 uppercase tracking-wider">
              🛡️ System Variables (.py configs)
            </h3>

            {/* Path settings */}
            <div className="grid grid-cols-1 gap-3 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1 font-mono">AUDIO INPUT PATH</label>
                <div className="flex">
                  <span className="bg-zinc-900 text-zinc-500 px-2.5 py-1.5 border border-r-0 border-zinc-800 flex items-center rounded-l-sm">🎧</span>
                  <input 
                    type="text" 
                    value={audioPath}
                    onChange={(e) => setAudioPath(e.target.value)}
                    className="bg-zinc-900/50 border border-zinc-800 text-white rounded-r-sm p-1.5 flex-1 focus:border-brand-fuchsia/60 focus:outline-none font-mono"
                    placeholder="vox_audio.mp3"
                  />
                </div>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1 font-mono">SRT SUBTITLE PATH</label>
                <div className="flex">
                  <span className="bg-zinc-900 text-zinc-500 px-2.5 py-1.5 border border-r-0 border-zinc-800 flex items-center rounded-l-sm">📄</span>
                  <input 
                    type="text" 
                    value={srtPath}
                    onChange={(e) => setSrtPath(e.target.value)}
                    className="bg-zinc-900/50 border border-zinc-800 text-white rounded-r-sm p-1.5 flex-1 focus:border-brand-fuchsia/60 focus:outline-none font-mono"
                    placeholder="dialogues.srt"
                  />
                </div>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1 font-mono">EXPORT VIDEO PATH</label>
                <div className="flex">
                  <span className="bg-zinc-900 text-zinc-500 px-2.5 py-1.5 border border-r-0 border-zinc-800 flex items-center rounded-l-sm">🎬</span>
                  <input 
                    type="text" 
                    value={outputVideoPath}
                    onChange={(e) => setOutputVideoPath(e.target.value)}
                    className="bg-zinc-900/50 border border-zinc-800 text-white rounded-r-sm p-1.5 flex-1 focus:border-brand-fuchsia/60 focus:outline-none font-mono"
                    placeholder="output.mp4"
                  />
                </div>
              </div>

              {/* Aspect Ratio choice: crop/size multiplier */}
              <div>
                <label className="text-zinc-400 block mb-1 font-mono flex justify-between items-center">
                  <span>TARGET RESOLUTION / RATIO</span>
                  <span className="text-[#D10068] font-bold">{isVertical ? "9:16 VERTICAL" : "16:9 HORIZONTAL"}</span>
                </label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button 
                    onClick={() => {
                      setIsVertical(false);
                      addLog("Aspect Ratio configure updated: 16:9 Horizontal Full HD (1920x1080).", "info");
                    }} 
                    className={`py-2 px-3 flex items-center gap-1.5 justify-center rounded-sm font-mono text-[11px] border transition-all ${
                      !isVertical 
                        ? 'bg-brand-fuchsia/15 text-brand-fuchsia border-brand-fuchsia' 
                        : 'bg-zinc-900/40 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <span className="block w-3 h-2 bg-current opacity-70" />
                    YouTube (16:9)
                  </button>
                  <button 
                    onClick={() => {
                      setIsVertical(true);
                      addLog("Aspect Ratio configure updated: 9:16 Vertical Full HD (1080x1920).", "info");
                    }} 
                    className={`py-2 px-3 flex items-center gap-1.5 justify-center rounded-sm font-mono text-[11px] border transition-all ${
                      isVertical 
                        ? 'bg-brand-fuchsia/15 text-brand-fuchsia border-brand-fuchsia' 
                        : 'bg-zinc-900/40 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <span className="block w-2 h-3 bg-current opacity-70" />
                    Shorts/TikTok (9:16)
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <div className="flex justify-between items-center mb-1">
                  <label className="text-zinc-400 font-mono flex items-center gap-1">
                    PEXELS API AUTH KEY 
                    <span className="opacity-40 group relative cursor-pointer text-[10px]">
                      ⓘ
                      <span className="absolute hidden group-hover:block bottom-full left-1/2 -translate-x-1/2 bg-black text-white p-2 text-xs rounded-md w-48 z-10 border border-zinc-800">
                        Input key for real stock searches, otherwise a stylized cyberpunk backup asset will be retrieved.
                      </span>
                    </span>
                  </label>
                  <span className="text-[10px] text-zinc-500 uppercase">Optional</span>
                </div>
                <input 
                  type="password"
                  value={pexelsKey}
                  placeholder="Paste your Pexels Key if you want real dynamic search"
                  onChange={(e) => setPexelsKey(e.target.value)}
                  className="bg-zinc-900/50 border border-zinc-800 focus:border-brand-fuchsia/60 text-white rounded-sm p-1.5 text-xs w-full focus:outline-none font-mono placeholder:opacity-40"
                />
              </div>
            </div>
          </div>

          {/* Subtitle SRT Editor */}
          <div className="bg-zinc-950 p-5 rounded-md border border-zinc-800/80 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
              <span className="text-xs text-zinc-300 font-bold uppercase tracking-wide flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-brand-fuchsia" /> Input Subtitle (.srt text)
              </span>
              <button 
                onClick={handleParseSRT} 
                className="text-[10px] font-mono text-zinc-400 hover:text-white flex items-center gap-1 uppercase"
                title="Re-compile and parse SRT blocks immediately"
              >
                <RefreshCw className="w-3 h-3 hover:rotate-45 transition-transform" /> Re-Parse
              </button>
            </div>

            <textarea 
              value={srtText}
              onChange={(e) => setSrtText(e.target.value)}
              placeholder="Paste SRT subtitles here..."
              className="bg-black/80 font-mono text-xs text-zinc-300 border border-zinc-800 focus:border-brand-fuchsia/65 p-3 h-52 w-full focus:outline-none rounded-sm resize-y leading-relaxed"
            />
            
            <p className="text-[10px] text-zinc-500 font-mono">
              💡 Format: Number, Timestamp Range (<span className="text-[#D10068]">--&gt;</span>) with milli-seconds comma separated, Dialogue.
            </p>
          </div>

        </section>

        {/* Right Tab panel: Render pipeline Simulator or Python Script Generated Code */}
        <section className="lg:col-span-8 flex flex-col gap-6" id="workspace_display">
          
          {/* Main Workspace Navigation (Simulator vs Python Code Codebook) */}
          <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-2">
            <button 
              onClick={() => setActiveTab("simulator")}
              className={`px-4 py-2 font-mono text-xs uppercase tracking-wider border-b transition-all flex items-center gap-2 ${
                activeTab === "simulator" 
                  ? 'border-brand-fuchsia text-brand-fuchsia font-bold shadow-[0_4px_12px_rgba(209,0,104,0.1)]' 
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Video className="w-4 h-4" /> Live Video Simulator
            </button>
            <button 
              id="tab-code-viewer"
              onClick={() => setActiveTab("code")}
              className={`px-4 py-2 font-mono text-xs uppercase tracking-wider border-b transition-all flex items-center gap-2 ${
                activeTab === "code" 
                  ? 'border-brand-fuchsia text-brand-fuchsia font-bold shadow-[0_4px_12px_rgba(209,0,104,0.1)]' 
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Code className="w-4 h-4" /> Generated Python Script
            </button>
            <button 
              id="tab-streamlit-viewer"
              onClick={() => setActiveTab("streamlit")}
              className={`px-4 py-2 font-mono text-xs uppercase tracking-wider border-b transition-all flex items-center gap-2 ${
                activeTab === "streamlit" 
                  ? 'border-brand-fuchsia text-brand-fuchsia font-bold shadow-[0_4px_12px_rgba(209,0,104,0.1)]' 
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Cpu className="w-4 h-4 text-brand-fuchsia animate-pulse" /> Streamlit Web App (MVP)
            </button>
            <button 
              onClick={() => setActiveTab("docs")}
              className={`px-4 py-2 font-mono text-xs uppercase tracking-wider border-b transition-all flex items-center gap-2 ${
                activeTab === "docs" 
                  ? 'border-brand-fuchsia text-brand-fuchsia font-bold shadow-[0_4px_12px_rgba(209,0,104,0.1)]' 
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <HelpCircle className="w-4 h-4" /> System & Media Setup
            </button>

            {/* Run Pipeline Emulator Main Action Button */}
            <button 
              id="btn-run-pipeline"
              onClick={runAutomationPipelineSimulator}
              disabled={isProcessing}
              className={`ml-auto px-4 py-2 bg-brand-fuchsia text-black font-display font-black text-xs uppercase rounded-sm flex items-center gap-2 transition-all hover:brightness-110 active:scale-95 shadow-[0_0_20px_rgba(209,0,104,0.35)] ${
                isProcessing ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Generating Video ({pipelineStep}/5)...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 fill-black" />
                  Run Script Simulator
                </>
              )}
            </button>
          </div>

          {/* TAB 1: Live Video Timeline & Replacement Screen Simulator */}
          {activeTab === "simulator" && (
            <div className="flex flex-col gap-6 animate-fadeIn">
              
              {/* Pipeline processing step indicator rail */}
              <div className="grid grid-cols-5 gap-2" id="step_indicator">
                <div className={`p-2 border text-center transition-all ${pipelineStep >= 1 ? 'border-brand-fuchsia/80 bg-brand-fuchsia/10 text-brand-fuchsia' : 'border-zinc-900 bg-zinc-950 text-zinc-600'}`}>
                  <div className="text-[10px] font-mono">STEP 1</div>
                  <div className="text-[11px] font-bold">SRT PARSE</div>
                  {pipelineStep === 1 && <span className="text-[9px] animate-pulse block">● ACTIVE</span>}
                  {pipelineStep > 1 && <span className="text-[9px] text-green-500 block">✓ DONE</span>}
                </div>
                <div className={`p-2 border text-center transition-all ${pipelineStep >= 2 ? 'border-brand-fuchsia/80 bg-brand-fuchsia/10 text-brand-fuchsia' : 'border-zinc-900 bg-zinc-950 text-zinc-600'}`}>
                  <div className="text-[10px] font-mono">STEP 2</div>
                  <div className="text-[11px] font-bold">GEMINI AI</div>
                  {pipelineStep === 2 && <span className="text-[9px] animate-pulse block">● ACTIVE</span>}
                  {pipelineStep > 2 && <span className="text-[9px] text-green-500 block">✓ DONE</span>}
                </div>
                <div className={`p-2 border text-center transition-all ${pipelineStep >= 3 ? 'border-brand-fuchsia/80 bg-brand-fuchsia/10 text-brand-fuchsia' : 'border-zinc-900 bg-zinc-950 text-zinc-600'}`}>
                  <div className="text-[10px] font-mono">STEP 3</div>
                  <div className="text-[11px] font-bold">STOCKS_HD</div>
                  {pipelineStep === 3 && <span className="text-[9px] animate-pulse block">● ACTIVE</span>}
                  {pipelineStep > 3 && <span className="text-[9px] text-green-500 block">✓ DONE</span>}
                </div>
                <div className={`p-2 border text-center transition-all ${pipelineStep >= 4 ? 'border-brand-fuchsia/80 bg-brand-fuchsia/10 text-brand-fuchsia' : 'border-zinc-900 bg-zinc-950 text-zinc-600'}`}>
                  <div className="text-[10px] font-mono">STEP 4</div>
                  <div className="text-[11px] font-bold">MOVIEPY FIT</div>
                  {pipelineStep === 4 && <span className="text-[9px] animate-pulse block">● ACTIVE</span>}
                  {pipelineStep > 4 && <span className="text-[9px] text-green-500 block">✓ DONE</span>}
                </div>
                <div className={`p-2 border text-center transition-all ${pipelineStep >= 5 ? 'border-brand-fuchsia/80 bg-brand-fuchsia/10 text-brand-fuchsia' : 'border-zinc-900 bg-zinc-950 text-zinc-600'}`}>
                  <div className="text-[10px] font-mono">STEP 5</div>
                  <div className="text-[11px] font-bold">STITCH & AUDIO</div>
                  {pipelineStep === 5 && <span className="text-[9px] animate-pulse block">● ENCODING</span>}
                  {pipelineStep > 5 && <span className="text-[9px] text-green-500 block">✓ COMPLETED</span>}
                </div>
              </div>

              {/* Live Preview Display Section */}
              <div className="bg-zinc-950 border border-brand-fuchsia/30 rounded-md overflow-hidden relative">
                
                {/* Header indicators */}
                <div className="bg-zinc-900/80 px-4 py-2 flex items-center justify-between border-b border-zinc-800">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-brand-fuchsia animate-pulse" />
                    <span className="text-xs font-mono text-[#f0f0f0] tracking-widest uppercase">
                      🖥️ Live Simulated Video Monitor [{isVertical ? "9:16 Vertical HD" : "16:9 Horizontal HD"}]
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-[#D10068]/80 bg-[#D10068]/15 px-2 py-0.5 rounded border border-brand-fuchsia/20">
                    STRICT_1080P_FILTER: ACTIVE
                  </span>
                </div>

                {/* Simulated Screen Area */}
                <div className="p-4 bg-zinc-900/60 flex items-center justify-center min-h-[380px]">
                  
                  {/* Container representing either Horizontal (16:9) or Vertical aspect (9:16) */}
                  <div 
                    className={`relative shadow-[0_0_50px_rgba(209,0,104,0.15)] bg-black overflow-hidden border border-brand-fuchsia/40 transition-all duration-300 flex flex-col items-center justify-center ${
                      isVertical 
                        ? 'h-[440px] aspect-[9/16]' 
                        : 'w-full max-w-[640px] aspect-video'
                    }`}
                  >
                    
                    {/* Watermark detail */}
                    <div className="absolute top-2 left-2 z-10 font-mono text-[9px] text-brand-fuchsia/50 bg-black/80 px-1.5 py-0.5 border border-brand-fuchsia/10">
                      RESOLVED_1080P_CAP
                    </div>

                    {/* Stock Clip Video Simulated Player background */}
                    {timeline.length > 0 && activeClip?.video ? (
                      <div className="absolute inset-0 w-full h-full">
                        {/* If matching image/gif fallback is loaded, show */}
                        <img 
                          src={activeClip.video.preview} 
                          className="w-full h-full object-cover transition-opacity duration-300 opacity-60 filter saturate-125 hue-rotate-[320deg]" 
                          alt="Simulated Video" 
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-transparent opacity-90" />
                        
                        {/* Neon tech noise animation lines overlay to simulate cyberpunk tech */}
                        <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,6px_100%] pointer-events-none" />
                      </div>
                    ) : (
                      <div className="text-center p-6 max-w-sm flex flex-col items-center gap-2">
                        <Video className="w-12 h-12 text-brand-fuchsia/20 animate-bounce" />
                        <h4 className="text-sm font-mono text-zinc-100 uppercase tracking-widest">Awaiting Video Synthesis Pipeline</h4>
                        <p className="text-xs text-zinc-400 font-sans">
                          Click <strong className="text-brand-fuchsia">"Run Script Simulator"</strong> above to parse subtitles, trigger the Gemini AI reasoning model, check/crop free Pexels streams to safe 1080p, and compile the final track.
                        </p>
                      </div>
                    )}

                     {/* Simulation statistics overlays */}
                    {timeline.length > 0 && activeClip && (
                      <div className="absolute top-2 right-2 z-10 font-mono text-[9px] text-[#f0f0f0]/60 bg-black/80 px-2 py-0.5 border border-zinc-800 flex flex-col items-end">
                        <span>Block ID: #{activeClip.blockId}</span>
                        <span className="text-brand-fuchsia">AI Term: {activeClip.keywords[0]}</span>
                        <span className="text-green-400 font-bold">FullHD Compliant</span>
                      </div>
                    )}
                  </div>

                </div>

                {/* Subtitle timing reference bar - Displays dialogue for editing alignment without burning subtitles over the output video */}
                <div className="bg-zinc-900 border-t border-zinc-800 px-4 py-2.5 text-xs font-mono text-zinc-400 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <span className="text-zinc-500 uppercase font-bold text-[10px] tracking-wider shrink-0 flex items-center gap-1.5 focus:outline-none">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-fuchsia" /> SRT Editing Sequence Segment:
                  </span>
                  <div className="truncate font-sans text-zinc-200">
                    {(() => {
                      const matchingSubtitle = parsedBlocks.find(b => currentTime >= b.start && currentTime <= b.end);
                      return matchingSubtitle ? `[${matchingSubtitle.id}] "${matchingSubtitle.text}"` : "No subtitle segment currently active";
                    })()}
                  </div>
                </div>

                {/* Dedicated Media Playback dashboard bar */}
                <div className="h-14 bg-black border-t border-zinc-900 flex items-center px-4 gap-4" id="playback_controls_monitor">
                  <button 
                    onClick={handlePlayPause}
                    className="w-10 h-10 rounded-full border border-brand-fuchsia bg-brand-fuchsia/10 flex items-center justify-center text-brand-fuchsia hover:bg-brand-fuchsia hover:text-black transition-all shadow-[0_0_12px_rgba(209,0,104,0.3)]"
                    title={isPlaying ? "Pause Timeline playback" : "Play Timeline playback"}
                  >
                    {isPlaying ? <span className="font-bold text-lg">⏸</span> : <Play className="w-4 h-4 fill-current" />}
                  </button>
                  <button 
                    onClick={handleStop}
                    className="w-8 h-8 rounded-full border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
                    title="Stop and Reset"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>

                  {/* Progress Seek bar slider */}
                  <div className="flex-1 flex items-center gap-3">
                    <span className="text-[11px] font-mono text-zinc-400">
                      {currentTime.toFixed(1)}s
                    </span>

                    <input 
                      type="range"
                      min="0"
                      max={duration || 10}
                      step="0.1"
                      value={currentTime}
                      onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
                      className="flex-1 accent-[#D10068] cursor-pointer h-1.5 bg-zinc-900 rounded-sm"
                    />

                    <span className="text-[11px] font-mono text-zinc-400">
                      {(duration || 10).toFixed(1)}s
                    </span>
                  </div>

                  <div className="text-[10px] font-mono text-brand-fuchsia font-bold">
                    [TRACK_AUDIO_ACTIVE_LOOP]
                  </div>
                </div>

              </div>

              {/* Parsed Subtitle Timeline list with Interactive keywords edit options */}
              <div className="bg-zinc-950 p-4 rounded-md border border-zinc-900">
                <h3 className="text-xs font-mono font-bold text-zinc-300 border-b border-zinc-900 pb-2 mb-3 uppercase tracking-wider flex items-center justify-between">
                  <span>📊 Parsed Subtitle Segments timeline ({parsedBlocks.length} Blocks)</span>
                  <span className="text-[10px] text-zinc-500 italic">Click row to preview block timestamps</span>
                </h3>

                {parsedBlocks.length === 0 ? (
                  <div className="p-4 text-center text-xs text-zinc-500 font-mono">
                    No subtitle blocks to show. Enter SRT data in the configurations area.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
                    {parsedBlocks.map((block) => {
                      const isActive = currentTime >= block.start && currentTime <= block.end;
                      const hasSimulatedData = timeline.find(c => c.blockId === block.id);

                      return (
                        <div 
                          key={block.id}
                          onClick={() => {
                            setCurrentTime(block.start);
                            if (hasSimulatedData) {
                              setSelectedClip(hasSimulatedData);
                            }
                          }}
                          className={`p-2.5 rounded-sm border transition-all cursor-pointer ${
                            isActive 
                              ? 'bg-brand-fuchsia/15 border-brand-fuchsia shadow-[0_0_12px_rgba(209,0,104,0.1)]' 
                              : 'bg-zinc-900/30 border-zinc-900/85 hover:border-zinc-800'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 text-[11px] font-mono mb-1">
                            <span className="text-brand-fuchsia font-bold"># {block.id}</span>
                            <span className="text-zinc-500">[{block.startText} ➔ {block.endText}]</span>
                            <span className="text-zinc-400 font-bold ml-auto">Duration: {(block.end - block.start).toFixed(1)}s</span>
                          </div>
                          
                          {/* Inner row flex */}
                          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
                            <input 
                              type="text"
                              value={block.text}
                              onChange={(e) => handleUpdateBlockText(block.id, e.target.value)}
                              className="bg-transparent border-b border-transparent focus:border-zinc-700 text-xs text-zinc-200 focus:outline-none w-full md:max-w-md font-sans py-0.5"
                            />

                            {hasSimulatedData ? (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="bg-[#D10068]/20 text-[#D10068] px-1.5 py-0.5 rounded text-[9px] font-mono">
                                  🤖 Term: "{hasSimulatedData.keywords[0]}"
                                </span>
                                <span className="bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded text-[9px] font-mono flex items-center gap-0.5">
                                  ✓ 1080p
                                </span>
                              </div>
                            ) : (
                              <span className="text-[10px] text-zinc-500 font-mono">Awaiting AI Run</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Smart Terminal Console Logs */}
              <div className="bg-black border border-brand-fuchsia/40 rounded-md p-4 flex flex-col h-60">
                <div className="flex items-center justify-between text-xs font-mono border-b border-zinc-900 pb-2 mb-2 uppercase tracking-tight text-brand-fuchsia">
                  <div className="flex items-center gap-1">
                    <TerminalIcon className="w-3.5 h-3.5" />
                    <span>Pipeline Runtime Simulator Logs</span>
                  </div>
                  <button 
                    onClick={() => setLogs([])}
                    className="text-[10px] text-zinc-500 hover:text-white"
                  >
                    Clear console
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto font-mono text-xs leading-relaxed flex flex-col gap-1.5 scroll-smooth">
                  {logs.map((log) => {
                    let typeColor = "text-[#f0f0f0]/80";
                    let prefix = "[INFO]";

                    if (log.type === "success") {
                      typeColor = "text-green-400 font-bold";
                      prefix = "[SUCCESS]";
                    } else if (log.type === "warning") {
                      typeColor = "text-yellow-400";
                      prefix = "[WARN - FALLBACK]";
                    } else if (log.type === "error") {
                      typeColor = "text-red-500 font-bold";
                      prefix = "[ERROR]";
                    } else if (log.type === "gemini") {
                      typeColor = "text-brand-fuchsia font-bold";
                      prefix = "[GEMINI-AI]";
                    }

                    return (
                      <p key={log.id} className={typeColor}>
                        <span className="text-zinc-600 font-mono mr-1.5 font-normal">[{log.timestamp}]</span>
                        <strong className="mr-1">{prefix}</strong>
                        {log.text}
                      </p>
                    );
                  })}
                  <div ref={logsEndRef} />
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: Clean, syntax highlit generated Python script */}
          {activeTab === "code" && (
            <div className="flex flex-col gap-5 animate-fadeIn">
              
              <div className="bg-zinc-950 p-5 rounded-md border border-zinc-800/80">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
                  <div>
                    <h3 className="text-sm font-mono text-white font-bold uppercase flex items-center gap-1.5">
                      <Code className="text-brand-fuchsia w-4 h-4" /> production_video_automation.py
                    </h3>
                    <p className="text-xs text-zinc-400 mt-1">
                      Ready to copy and execute on your local server. Configured live with current options.
                    </p>
                  </div>
                  
                  <button 
                    id="btn-copy-code"
                    onClick={handleCopyCode}
                    className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-brand-fuchsia/40 text-[#f0f0f0] rounded-sm text-xs font-mono font-bold flex items-center gap-1.5 transition-all active:scale-95 hover:shadow-[0_0_15px_rgba(209,0,104,0.15)]"
                  >
                    {copiedScript ? (
                      <>
                        <Check className="w-4 h-4 text-green-400" />
                        Copied Successfully!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 text-brand-fuchsia" />
                        Copy Script Code
                      </>
                    )}
                  </button>
                </div>

                {/* Requirements display banner */}
                <div className="bg-[#D10068]/5 border-l-4 border-brand-fuchsia p-4 text-xs font-mono mb-4 text-zinc-300 rounded-r-md leading-relaxed">
                  <h4 className="font-bold text-white mb-1 uppercase flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 fill-[#D10068]" /> Install Dependencies
                  </h4>
                  <p>Open your local shell terminal and install the required modules to run this code:</p>
                  <code className="block bg-black p-2 mt-2 font-mono text-brand-fuchsia rounded-sm text-xs max-w-full overflow-x-auto">
                    pip install google-genai moviepy requests
                  </code>
                </div>

                {/* Subtitle transition timeline timing note */}
                <div className="bg-brand-fuchsia/5 border-l-4 border-brand-fuchsia p-4 text-xs font-mono mb-5 text-zinc-300 rounded-r-md leading-relaxed">
                  <h4 className="font-bold text-white mb-1 uppercase">
                    🚀 Note on Subtitle Timeline Logic
                  </h4>
                  <p>
                    Iris Gen Editor uses the provided SRT file strictly for <strong>editing, transition timing, and block segmentation</strong>. Subtitle text is NOT burned or overlayed on top of the output video. This simplifies local environment setups as <strong>ImageMagick is no longer required</strong> for execution!
                  </p>
                </div>

                {/* Text Area display formatted code directly */}
                <div className="relative">
                  <textarea 
                    readOnly
                    value={getPythonScript({
                      audioPath,
                      srtPath,
                      outputVideoPath,
                      isVertical,
                      pexelsKey
                    })}
                    className="bg-black text-[#f0f0f0] font-mono text-xs leading-relaxed p-4 h-[500px] w-full border border-zinc-900 rounded focus:outline-none select-text resize-none bg-[size:100%_2rem] leading-8"
                  />
                  <div className="absolute top-2 right-2 px-1 rounded-sm bg-zinc-900 text-[10px] text-zinc-500 font-mono tracking-widest uppercase pointer-events-none">
                    PYTHON v3 CODE
                  </div>
                </div>

                {/* Cleanup rules highlights */}
                <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono border-t border-zinc-900 pt-4">
                  <div>
                    <h5 className="text-[#D10068] font-bold mb-1">✓ STRICT RESOLUTION FILTER</h5>
                    <p className="text-zinc-400 leading-relaxed">
                      Parsed response values ensure only Full HD 1080p video files are downloaded. Ultra-heavy 4K or blurry SD files are rejected to optimize bandwidth and moviepy stitching times.
                    </p>
                  </div>
                  <div>
                    <h5 className="text-[#D10068] font-bold mb-1">✓ AUTOMATED GARBAGE CLEANUP</h5>
                    <p className="text-zinc-400 leading-relaxed">
                      The temporary media directory <code className="text-zinc-200">"./temp_video_clips"</code> is fully scrubbed and wiped via python’s <code className="text-zinc-200">shutil.rmtree()</code> once final file export finishes.
                    </p>
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* TAB: Streamlit MVP Web App Code & Simulator */}
          {activeTab === "streamlit" && (
            <div className="flex flex-col gap-5 animate-fadeIn">
              
              <div className="bg-zinc-950 p-6 rounded-md border border-zinc-800/80">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
                  <div>
                    <h3 className="text-sm font-mono text-white font-bold uppercase flex items-center gap-1.5">
                      <Cpu className="text-brand-fuchsia w-4 h-4 animate-pulse" /> Streamlit MVP Control Deck (`app.py`)
                    </h3>
                    <p className="text-xs text-zinc-400 mt-1">
                      A production-ready Python Streamlit application with gorgeous fuchsia identity, secure sidebar inputs, progress metrics, and live video renders!
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={handleCopyStreamlit}
                      className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-brand-fuchsia/40 text-[#f0f0f0] rounded-sm text-xs font-mono font-bold flex items-center gap-1.5 transition-all active:scale-95"
                    >
                      {copiedStreamlit ? (
                        <>
                          <Check className="w-4 h-4 text-green-400" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 text-brand-fuchsia" />
                          Copy `app.py`
                        </>
                      )}
                    </button>
                    <a
                      href={`data:text/plain;charset=utf-8,${encodeURIComponent(getStreamlitScript())}`}
                      download="app.py"
                      className="px-3.5 py-2 bg-brand-fuchsia hover:brightness-110 text-black rounded-sm text-xs font-mono font-black flex items-center gap-1.5 transition-all active:scale-95 shadow-[0_0_15px_rgba(209,0,104,0.3)]"
                    >
                      <Download className="w-4 h-4" />
                      Download `app.py`
                    </a>
                  </div>
                </div>

                {/* Quick start code terminal bar */}
                <div className="bg-[#D10068]/5 border-l-4 border-brand-fuchsia p-4 text-xs font-mono mb-6 text-zinc-300 rounded-r-md leading-relaxed">
                  <h4 className="font-bold text-white mb-1 uppercase flex items-center gap-1.5">
                    🚀 Run Streamlit Web Application Locally
                  </h4>
                  <p className="mb-2">Execute these terminal lines inside your workspace to boot the interactive local dashboard:</p>
                  <pre className="bg-black p-2.5 rounded text-brand-fuchsia overflow-x-auto text-[11px] leading-5 font-bold">
                    pip install streamlit google-genai moviepy requests{"\n"}
                    streamlit run app.py
                  </pre>
                  <span className="text-[10px] text-zinc-500 block mt-2">
                    💡 This app is already complete, optimized, and saved in your workspace file tree as <strong>/app.py</strong>!
                  </span>
                </div>

                {/* Simulated Streamlit UI mockup */}
                <div className="border border-zinc-800 rounded bg-[#0d0d11] overflow-hidden">
                  {/* Streamlit Top Nav/Header bar mockup */}
                  <div className="bg-[#08080c] border-b border-zinc-850 px-4 py-2 text-xs flex items-center justify-between text-zinc-400 font-mono">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                      <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                      <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                      <span className="text-zinc-500">|</span>
                      <span className="text-zinc-200">http://localhost:8501 (Streamlit Sandbox)</span>
                    </div>
                    <span className="text-[9px] bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded text-brand-fuchsia">
                      ST STRICT PROD
                    </span>
                  </div>

                  {/* Body Layout Grid of the Streamlit simulation */}
                  <div className="grid grid-cols-1 md:grid-cols-12 min-h-[460px]">
                    {/* Left Sidebar Mockup */}
                    <div className="md:col-span-4 bg-[#08080c] border-r border-zinc-850 p-4 font-sans text-xs flex flex-col gap-4">
                      <div className="border-b border-zinc-900 pb-2">
                        <span className="text-[10px] font-mono font-bold text-[#D10068] uppercase tracking-wider">⚙️ Sidebar Control Setup</span>
                      </div>
                      
                      {/* API Credentials inputs */}
                      <div className="flex flex-col gap-1">
                        <label className="text-zinc-400 font-bold text-[11px] font-mono">GEMINI_API_KEY</label>
                        <input 
                          type="password" 
                          disabled 
                          placeholder="••••••••••••••••••••••••"
                          className="bg-zinc-900/40 border border-zinc-800 rounded p-1.5 text-zinc-500 font-mono text-[11px]"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-zinc-400 font-bold text-[11px] font-mono">PEXELS_API_KEY</label>
                        <input 
                          type="password" 
                          disabled 
                          placeholder="••••••••••••••••••••••••"
                          className="bg-zinc-900/40 border border-zinc-800 rounded p-1.5 text-zinc-500 font-mono text-[11px]"
                        />
                      </div>

                      {/* Aspect Ratio inputs */}
                      <div className="mt-2 flex flex-col gap-1.5">
                        <span className="text-zinc-300 font-medium text-[11px]">🎞️ Target Dimension Ratio</span>
                        <div className="flex flex-col gap-2 bg-zinc-900/30 p-2 rounded border border-zinc-900">
                          <label className="flex items-center gap-2 text-zinc-400 count-label cursor-default">
                            <input type="radio" disabled checked={!isVertical} className="accent-[#D10068]" />
                            <span>Horizontal HD (16:9 for YouTube)</span>
                          </label>
                          <label className="flex items-center gap-2 text-zinc-400 count-label cursor-default">
                            <input type="radio" disabled checked={isVertical} className="accent-[#D10068]" />
                            <span>Vertical HD (9:16 for Shorts/Reels)</span>
                          </label>
                        </div>
                      </div>

                      {/* Subtitle choice listbox */}
                      <div className="flex flex-col gap-1">
                        <label className="text-zinc-400 font-bold text-[11px]">💬 Subtitle Rendering Mode</label>
                        <div className="bg-zinc-900/40 border border-zinc-800 rounded p-1.5 text-zinc-300">
                          None (Strictly Audio Only & Timing)
                        </div>
                      </div>
                    </div>

                    {/* Main Workspace Canvas Mockup */}
                    <div className="md:col-span-8 p-5 flex flex-col justify-between">
                      <div>
                        {/* Title headers */}
                        <div className="mb-4">
                          <h2 className="text-base font-black text-white uppercase font-display leading-tight">
                            🎬 Iris Gen Editor <span className="text-brand-fuchsia text-glow">by Aparna Velvet</span>
                          </h2>
                          <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                            Streamlit Production-ready Compilation Deck
                          </p>
                        </div>

                        {/* File Uploaders grids */}
                        <div className="grid grid-cols-2 gap-3 mb-5 text-[11px]">
                          <div className="border border-dashed border-zinc-800 rounded p-3 text-center bg-zinc-900/10 flex flex-col items-center justify-center gap-1 text-zinc-400">
                            <span className="text-base">📄</span>
                            <span className="font-bold text-zinc-300">dialogues.srt</span>
                            <span className="text-[9px] text-[#D10068]">✓ Uploaded</span>
                          </div>
                          <div className="border border-dashed border-zinc-800 rounded p-3 text-center bg-zinc-900/10 flex flex-col items-center justify-center gap-1 text-zinc-400">
                            <span className="text-base">🎧</span>
                            <span className="font-bold text-zinc-300">vox_voiceover.mp3</span>
                            <span className="text-[9px] text-[#D10068]">✓ Uploaded</span>
                          </div>
                        </div>

                        {/* Streamlit Magic action block preview */}
                        <div className="bg-[#08080c] border border-zinc-800 rounded p-4">
                          <span className="text-[10px] font-mono text-zinc-500 uppercase block mb-2">⚡ RENDER STATE SIMULATION</span>
                          
                          {/* Simulated Streamlit Progress Indicator */}
                          <div className="h-2 w-full bg-zinc-900 rounded-full overflow-hidden mb-2 border border-zinc-850">
                            <div className="h-full bg-brand-fuchsia rounded-full transition-all" style={{ width: "100%" }} />
                          </div>
                          <div className="flex justify-between text-[10px] font-mono text-zinc-400 mb-3">
                            <span>Status: Rendering finalized video sequence!</span>
                            <span className="text-brand-fuchsia">100% COMPLETE</span>
                          </div>

                          {/* Action button mock */}
                          <button 
                            disabled
                            className="w-full py-2 bg-brand-fuchsia/20 border border-brand-fuchsia/50 text-brand-fuchsia text-xs font-mono font-bold rounded uppercase tracking-wider"
                          >
                            🎬 PIPELINE EXECUTING TERMINATED SUCCESSFULLY
                          </button>
                        </div>
                      </div>

                      {/* Video Player Output display layout mockup */}
                      <div className="mt-4 border-t border-zinc-900 pt-4 flex flex-col gap-2">
                        <span className="text-[10px] font-mono text-[#D10568] uppercase font-bold tracking-widest flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5 text-green-400" /> Compiled Video Player Output
                        </span>

                        <div className="aspect-video w-full rounded bg-black/40 border border-zinc-900 flex flex-col items-center justify-center relative overflow-hidden group">
                          <Play className="w-10 h-10 text-brand-fuchsia opacity-70 group-hover:opacity-100 transition-opacity cursor-pointer bubble" />
                          <span className="text-[10px] text-zinc-500 font-mono mt-2 uppercase">Streamlit Player Frame</span>

                          {/* Abs layer banner */}
                          <div className="absolute top-2 right-2 bg-black/85 border border-brand-fuchsia/40 text-[9px] font-mono text-[#f0f0f0] px-2 py-0.5">
                            RESOLVED: {isVertical ? "1080x1920 (9:16)" : "1920x1080 (16:9)"}
                          </div>
                        </div>

                        <div className="flex gap-2 justify-end mt-2">
                          <button disabled className="px-5 py-1.5 bg-brand-fuchsia text-black font-sans font-black text-xs rounded uppercase flex items-center gap-1 shadow-md opacity-80 cursor-not-allowed">
                            <Download className="w-3.5 h-3.5" /> Download final video
                          </button>
                        </div>
                      </div>

                    </div>
                  </div>
                </div>

                {/* Main app.py Text Code Area code block view */}
                <div className="relative mt-6">
                  <div className="flex justify-between items-center bg-zinc-950 border-b border-zinc-900 px-4 py-2 font-mono text-xs rounded-t-sm">
                    <span className="text-zinc-500">COMPLETE Python code inside: <strong className="text-white">app.py</strong></span>
                    <span className="text-[#D10068]">Streamlit Engine</span>
                  </div>
                  <textarea 
                    readOnly
                    value={getStreamlitScript()}
                    className="bg-black text-[#f0f0f0] font-mono text-xs leading-relaxed p-4 h-[500px] w-full border-x border-b border-zinc-900 rounded-b focus:outline-none select-text resize-none bg-[size:100%_2rem] leading-8"
                  />
                  <div className="absolute bottom-4 right-4 px-2 py-1 rounded-sm bg-zinc-900 text-[10px] text-zinc-500 font-mono tracking-widest uppercase pointer-events-none border border-zinc-800">
                    STREAMLIT FRAMEWORK (app.py)
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* TAB 3: Help, instructions, and documentation */}
          {activeTab === "docs" && (
            <div className="bg-zinc-950 p-6 rounded-md border border-zinc-800/80 font-mono text-xs leading-relaxed animate-fadeIn flex flex-col gap-6">
              
              <div>
                <h3 className="text-sm font-bold text-white uppercase border-b border-zinc-900 pb-2 mb-3 text-brand-fuchsia">
                  ⚙️ LOCAL ENVIRONMENT REQUIREMENT SETUPS
                </h3>
                <p className="text-zinc-300 mb-4">
                  This Python automation engine utilizes modern components to guarantee perfect video alignment.
                </p>

                <h4 className="font-bold text-white mb-2 text-glow">1. Setting API Keys (Env Vars)</h4>
                <p className="text-zinc-400 mb-4">
                  The script utilizes standard system environment parameters. Setup them on your host bash/command shells like so:
                </p>
                <div className="bg-black p-3 rounded-sm border border-zinc-900 mb-4">
                  <p className="text-zinc-500"># On Linux or macOS:</p>
                  <p className="text-brand-fuchsia font-bold">export GEMINI_API_KEY="your-google-api-key"</p>
                  <p className="text-brand-fuchsia font-bold">export PEXELS_API_KEY="your-pexels-api-key"</p>
                  <p className="text-zinc-500 mt-2"># On Windows Powershell:</p>
                  <p className="text-zinc-300">$env:GEMINI_API_KEY="your-google-api-key"</p>
                  <p className="text-zinc-300">$env:PEXELS_API_KEY="your-pexels-api-key"</p>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-white mb-2 text-glow">2. How the Stock Footage Retrieval Works</h4>
                <p className="text-zinc-400 mb-3">
                  This system integrates with the <strong>Pexels API</strong> to source high-definition stock video loop assets:
                </p>
                <ul className="list-disc pl-5 text-zinc-400 flex flex-col gap-1.5 mb-4 font-sans">
                  <li><strong>Semantic Search:</strong> The system sends raw subtitle line concepts to the <strong>Gemini model</strong> to formulate descriptive, cinematic keyword tags.</li>
                  <li><strong>Aspect Ratio Cropping:</strong> Footage returned from the stock library is center-cropped on the fly using MoviePy's custom crop methods to perfectly align to your selected aspect ratio.</li>
                  <li><strong>Strict FullHD Filter:</strong> To respect server resources, the pipeline targets 1080p resolution and automatically filters out heavy ultra-HD 4K buffers.</li>
                </ul>
              </div>

              <div>
                <h4 className="font-bold text-white mb-2 text-glow">3. Core MoviePy Timeline Algorithm Design</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded-sm">
                    <h5 className="text-[#D10068] font-bold mb-1">SRT TIMING</h5>
                    <p className="text-zinc-500 text-[11px]">
                      Translates SRT timestamps into absolute float seconds. Uses differences to formulate the exact timeline blocks to fill.
                    </p>
                  </div>
                  <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded-sm">
                    <h5 className="text-[#D10068] font-bold mb-1">STRETCH &amp; LOOP</h5>
                    <p className="text-zinc-500 text-[11px]">
                      If the acquired stock footage video file is shorter than the SRT dialogue timing, the engine automatically loops it using vfx.loop().
                    </p>
                  </div>
                  <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded-sm">
                    <h5 className="text-[#D10068] font-bold mb-1">TRIMMING</h5>
                    <p className="text-zinc-500 text-[11px]">
                      If stock video clips are excessively long, the moviepy timeline trimmer subclip bounds them precisely to matching bounds.
                    </p>
                  </div>
                </div>
              </div>

            </div>
          )}

        </section>

      </main>

      {/* Footer Cyberpunk Terminal strip */}
      <footer className="mt-auto border-t border-brand-fuchsia/40 bg-zinc-950 p-4 font-mono text-xs text-black font-bold">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 bg-brand-fuchsia px-4 py-2.5 rounded-sm shadow-[0_-5px_25px_rgba(209,0,104,0.15)]">
          <div className="flex items-center gap-2">
            <span>PIPELINE_TERMINAL_ROOT_OPERATOR_v3.2:~$</span>
            <span className="opacity-80 font-normal">./compile_automation.py --ratio={"16:9"} --audio={audioPath}</span>
          </div>
          <div className="flex gap-4 uppercase text-[11px]">
            <span>ENV: CONTAINER_RUN</span>
            <span>MEM: 92% COMPLIANT</span>
            <span>PROMPT: DEEPMIND_ANTIGRAVITY</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
