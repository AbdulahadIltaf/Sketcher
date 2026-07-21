'use client';
import React, { useRef, useState, useEffect } from 'react';

export default function CharacterCreator() {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [style, setStyle] = useState('chibi');
  const [brushSize, setBrushSize] = useState(8);
  const [brushColor, setBrushColor] = useState('#ffffff');
  const [customPrompt, setCustomPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [resultImage, setResultImage] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Model warm-up state: 'warming' | 'ready' | 'error'
  const [modelStatus, setModelStatus] = useState('warming');
  const [warmupTime, setWarmupTime] = useState(0);

  // History stack for Undo/Redo
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Template guides for children
  const templates = {
    blank: [],
    creature: [
      { x: 256, y: 180, r: 70 }, // Head
      { x: 256, y: 330, r: 90 }, // Body
      { x: 170, y: 330, r: 25 }, // Left hand/foot guide
      { x: 342, y: 330, r: 25 }, // Right hand/foot guide
    ],
    hero: [
      { x: 256, y: 150, r: 60 }, // Face
      { x: 256, y: 300, r: 80 }, // Torso
      { x: 200, y: 240, r: 20 }, // Left Shoulder
      { x: 312, y: 240, r: 20 }, // Right Shoulder
    ],
  };

  useEffect(() => {
    clearCanvas('creature'); // Default to creature guide to welcome the user
  }, []);

  // Warm-up: ping /health on mount to eagerly boot the GPU container
  const BACKEND = "https://iltafabdulahad--generate-character.modal.run";
  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);

    fetch(`${BACKEND}/health`, { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        clearTimeout(timeoutId);
        if (data.status === 'ready') setModelStatus('ready');
        else setModelStatus('error');
      })
      .catch(err => {
        clearTimeout(timeoutId);
        if (err.name !== 'AbortError') setModelStatus('error');
        else setModelStatus('error'); // timed out
      });

    return () => controller.abort();
  }, []);

  // Warm-up elapsed timer
  useEffect(() => {
    if (modelStatus !== 'warming') return;
    const interval = setInterval(() => setWarmupTime(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [modelStatus]);

  // Timer for generation Progress estimation
  useEffect(() => {
    let interval;
    if (loading) {
      setElapsedTime(0);
      interval = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [loading]);

  const clearCanvas = (templateKey = 'blank') => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw template guide if requested
    if (templateKey !== 'blank' && templates[templateKey]) {
      ctx.strokeStyle = '#222831';
      ctx.lineWidth = 4;
      templates[templateKey].forEach(circle => {
        ctx.beginPath();
        ctx.arc(circle.x, circle.y, circle.r, 0, 2 * Math.PI);
        ctx.stroke();
      });
    }
    
    setResultImage(null);
    
    // Set initial history state
    const initialData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory([initialData]);
    setHistoryIndex(0);
  };

  const saveState = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(imageData);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = brushColor;
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      saveState();
    }
  };

  const handleUndo = () => {
    if (historyIndex <= 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const prevIndex = historyIndex - 1;
    ctx.putImageData(history[prevIndex], 0, 0);
    setHistoryIndex(prevIndex);
  };

  const handleRedo = () => {
    if (historyIndex >= history.length - 1) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const nextIndex = historyIndex + 1;
    ctx.putImageData(history[nextIndex], 0, 0);
    setHistoryIndex(nextIndex);
  };

  const handleGeneration = async () => {
    setLoading(true);
    const canvas = canvasRef.current;
    const base64Image = canvas.toDataURL('image/png');

    // Allow up to 5 minutes — cold-start GPU containers need time to load model weights
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);

    try {
      const response = await fetch(BACKEND, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          image: base64Image,
          style: style,
          customPrompt: customPrompt
        }),
      });

      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      const data = await response.json();
      if (data.status === 'success') {
        setResultImage(data.image);
      } else {
        alert("Generation issue encountered. Please try again.");
      }
    } catch (err) {
      clearTimeout(timeoutId);
      console.error(err);
      if (err.name === 'AbortError') {
        alert("Request timed out after 5 minutes. The GPU container may be overloaded — please try again.");
      } else {
        alert(`Connection error: ${err.message}. Make sure your Modal deployment is running.`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!resultImage) return;
    const link = document.createElement('a');
    link.href = resultImage;
    link.download = `character_${style}_${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper values for Progress
  // Cold-start: model download + VRAM load can take 60-120s on first request
  const progressPercentage = (() => {
    if (!loading) return 0;
    if (elapsedTime < 10) return elapsedTime * 2;              // 0-20%: sending + container boot
    if (elapsedTime < 60) return 20 + (elapsedTime - 10) * 0.8; // 20-60%: model loading into VRAM
    if (elapsedTime < 80) return 60 + (elapsedTime - 60) * 1.5; // 60-90%: inference running
    if (elapsedTime < 100) return 90 + (elapsedTime - 80) * 0.4; // 90-98%: finalizing
    return Math.min(98 + (elapsedTime - 100) * 0.05, 99);
  })();

  const progressMessage = (() => {
    if (elapsedTime < 5) return "🧠 Sending sketch to AI...";
    if (elapsedTime < 20) return "⚡ Booting GPU container (cold start)...";
    if (elapsedTime < 60) return "📦 Loading AI model weights into VRAM...";
    if (elapsedTime < 75) return "🎨 Analyzing sketch outlines...";
    if (elapsedTime < 90) return "✨ Denoising and painting pixels...";
    return `🚀 Finalizing character... (${elapsedTime}s — almost there!)`;
  })();

  return (
    <div style={{ minHeight: '100vh', padding: '2.5rem 1rem', position: 'relative' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        
        {/* Header Section */}
        <header style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <h1 style={{
            fontSize: '2.8rem',
            fontWeight: 800,
            background: 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '-0.03em',
            marginBottom: '0.5rem'
          }}>
            ✨ AI Cartoon Character Studio
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', fontWeight: 400 }}>
            Draw a sketch, choose a style, and let AI transform your art into a studio-ready asset!
          </p>
        </header>

        {/* Model Warm-up Status Banner */}
        <div style={{
          marginBottom: '2rem',
          borderRadius: '12px',
          overflow: 'hidden',
          border: modelStatus === 'ready'
            ? '1px solid rgba(34, 197, 94, 0.3)'
            : modelStatus === 'error'
              ? '1px solid rgba(239, 68, 68, 0.3)'
              : '1px solid rgba(99, 102, 241, 0.3)',
          background: modelStatus === 'ready'
            ? 'rgba(34, 197, 94, 0.06)'
            : modelStatus === 'error'
              ? 'rgba(239, 68, 68, 0.06)'
              : 'rgba(99, 102, 241, 0.06)',
          transition: 'all 0.5s ease',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.875rem 1.25rem'
          }}>

            {/* Status icon */}
            {modelStatus === 'warming' && (
              <div style={{
                width: '20px', height: '20px', flexShrink: 0,
                border: '3px solid rgba(99,102,241,0.2)',
                borderTop: '3px solid #818cf8',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }} />
            )}
            {modelStatus === 'ready' && (
              <div style={{ fontSize: '1.1rem', flexShrink: 0 }}>✅</div>
            )}
            {modelStatus === 'error' && (
              <div style={{ fontSize: '1.1rem', flexShrink: 0 }}>⚠️</div>
            )}

            {/* Status text */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {modelStatus === 'warming' && (
                <>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem', color: '#a5b4fc' }}>
                    Warming up GPU — loading AI model into VRAM...
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Generation will unlock automatically. Cold start may take 30–90s. ({warmupTime}s elapsed)
                  </p>
                </>
              )}
              {modelStatus === 'ready' && (
                <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem', color: '#4ade80' }}>
                  GPU model ready — draw your sketch and generate!
                </p>
              )}
              {modelStatus === 'error' && (
                <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem', color: '#f87171' }}>
                  Could not reach the backend. The Modal deployment may be offline.
                </p>
              )}
            </div>

            {/* Retry button on error */}
            {modelStatus === 'error' && (
              <button
                onClick={() => {
                  setModelStatus('warming');
                  setWarmupTime(0);
                  fetch(`${BACKEND}/health`, { signal: new AbortController().signal })
                    .then(r => r.json())
                    .then(d => setModelStatus(d.status === 'ready' ? 'ready' : 'error'))
                    .catch(() => setModelStatus('error'));
                }}
                style={{
                  flexShrink: 0, padding: '6px 14px', fontSize: '0.8rem', fontWeight: 600,
                  background: 'rgba(239,68,68,0.15)', color: '#f87171',
                  border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', cursor: 'pointer'
                }}
              >
                Retry
              </button>
            )}

          </div>

          {/* Warm-up progress bar */}
          {modelStatus === 'warming' && (
            <div style={{ height: '3px', background: 'rgba(99,102,241,0.1)' }}>
              <div style={{
                height: '100%',
                width: `${Math.min((warmupTime / 90) * 100, 95)}%`,
                background: 'linear-gradient(90deg, #6366f1, #818cf8)',
                transition: 'width 1s ease-out',
                borderRadius: '0 2px 2px 0',
              }} />
            </div>
          )}
        </div>

        {/* Dashboard Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '2.5rem',
          alignItems: 'start'
        }}>
          
          {/* LEFT: Drawing Studio Card */}
          <div style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--bg-card-border)',
            borderRadius: '16px',
            padding: '1.5rem',
            boxShadow: '0 10px 30px -10px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(12px)',
          }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#f3f4f6' }}>Canvas Workspace</h2>
              
              {/* Undo / Redo buttons */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleUndo}
                  disabled={historyIndex <= 0 || loading}
                  title="Undo last line"
                  style={{
                    background: historyIndex <= 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.08)',
                    color: historyIndex <= 0 ? 'var(--text-secondary)' : '#fff',
                    border: 'none',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    cursor: historyIndex <= 0 || loading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    fontSize: '0.9rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  ↩️ Undo
                </button>
                <button
                  onClick={handleRedo}
                  disabled={historyIndex >= history.length - 1 || loading}
                  title="Redo"
                  style={{
                    background: historyIndex >= history.length - 1 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.08)',
                    color: historyIndex >= history.length - 1 ? 'var(--text-secondary)' : '#fff',
                    border: 'none',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    cursor: historyIndex >= history.length - 1 || loading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    fontSize: '0.9rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  Redo ↪️
                </button>
              </div>
            </div>

            {/* Drawing Canvas Frame */}
            <div style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '1',
              background: '#000',
              borderRadius: '12px',
              overflow: 'hidden',
              border: '2px solid rgba(255,255,255,0.05)',
              boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.8)'
            }}>
              <canvas
                ref={canvasRef}
                width={512}
                height={512}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                style={{
                  display: 'block',
                  width: '100%',
                  height: '100%',
                  cursor: 'crosshair',
                  touchAction: 'none'
                }}
              />
            </div>

            {/* Workspace Controls */}
            <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

              {/* Color Picker */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Brush Color:</span>
                  <span style={{ color: '#fff', fontWeight: 600 }}>
                    <input
                      type="color"
                      value={brushColor}
                      onChange={(e) => setBrushColor(e.target.value)}
                      disabled={loading}
                      style={{
                        width: '40px',
                        height: '30px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                      title="Pick brush color"
                    />
                  </span>
                </div>
              </div>

              {/* Brush size slider */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Brush Size:</span>
                  <span style={{ color: '#fff', fontWeight: 600 }}>{brushSize}px</span>
                </div>
                <input
                  type="range"
                  min="3"
                  max="20"
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  disabled={loading}
                  style={{
                    width: '100%',
                    height: '6px',
                    borderRadius: '3px',
                    background: '#1e293b',
                    outline: 'none',
                    cursor: 'pointer',
                    accentColor: 'var(--color-primary)'
                  }}
                />
              </div>

              {/* Template Guides */}
              <div>
                <span style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  Template Guides:
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => clearCanvas('creature')}
                    disabled={loading}
                    style={{
                      flex: 1,
                      background: 'rgba(255,255,255,0.05)',
                      color: '#fff',
                      border: '1px solid rgba(255,255,255,0.08)',
                      padding: '8px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: 500,
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.1)'}
                    onMouseLeave={(e) => e.target.style.background = 'rgba(255,255,255,0.05)'}
                  >
                    👾 Creature
                  </button>
                  <button
                    onClick={() => clearCanvas('hero')}
                    disabled={loading}
                    style={{
                      flex: 1,
                      background: 'rgba(255,255,255,0.05)',
                      color: '#fff',
                      border: '1px solid rgba(255,255,255,0.08)',
                      padding: '8px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: 500,
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.1)'}
                    onMouseLeave={(e) => e.target.style.background = 'rgba(255,255,255,0.05)'}
                  >
                    👤 Figure
                  </button>
                  <button
                    onClick={() => clearCanvas('blank')}
                    disabled={loading}
                    style={{
                      flex: 1,
                      background: 'rgba(239, 68, 68, 0.15)',
                      color: '#ef4444',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      padding: '8px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: 500,
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => e.target.style.background = 'rgba(239, 68, 68, 0.25)'}
                    onMouseLeave={(e) => e.target.style.background = 'rgba(239, 68, 68, 0.15)'}
                  >
                    🧹 Clear
                  </button>
                </div>
              </div>

            </div>

          </div>

          {/* RIGHT: Generated Studio Asset Card */}
          <div style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--bg-card-border)',
            borderRadius: '16px',
            padding: '1.5rem',
            boxShadow: '0 10px 30px -10px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(12px)',
          }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#f3f4f6' }}>Generated Studio Asset</h2>

              {/* Style Option selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Style:</span>
                <select
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                  disabled={loading}
                  style={{
                    padding: '6px 12px',
                    background: '#1e293b',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="chibi">🤖 3D Pixar</option>
                  <option value="anime">🌸 Anime Art</option>
                  <option value="watercolor">🎨 Watercolor</option>
                  <option value="realistic">✨ Realistic</option>
                </select>
              </div>
            </div>

            {/* Custom Prompt Input */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                ✏️ Custom Description (Optional):
              </label>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                disabled={loading}
                placeholder="e.g., 'warrior princess with blue eyes and golden armor', 'cute cat wizard with stars'"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: '#1e293b',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  outline: 'none',
                  fontFamily: 'inherit',
                  minHeight: '60px',
                  resize: 'vertical',
                  cursor: loading ? 'not-allowed' : 'text'
                }}
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                💡 Tip: Describe your character for better AI understanding (e.g., "pirate captain", "space explorer", "dragon hunter")
              </p>
            </div>

            {/* Asset Display Frame */}
            <div style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '1',
              background: '#0f172a',
              borderRadius: '12px',
              border: resultImage ? '2px solid rgba(139, 92, 246, 0.3)' : '2px dashed rgba(255,255,255,0.08)',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: resultImage ? '0 0 20px rgba(139, 92, 246, 0.15)' : 'none',
              transition: 'all 0.3s ease'
            }}>
              
              {resultImage ? (
                <img
                  src={resultImage}
                  alt="AI Generated Character"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    animation: 'pulseGlow 4s infinite'
                  }}
                />
              ) : loading ? (
                /* Beautiful Step Loader inside the Output Frame */
                <div style={{ width: '80%', textAlign: 'center', padding: '1rem' }}>
                  
                  {/* Glowing Spinner */}
                  <div style={{
                    width: '50px',
                    height: '50px',
                    border: '4px solid rgba(139, 92, 246, 0.1)',
                    borderTop: '4px solid var(--color-accent)',
                    borderRadius: '50%',
                    margin: '0 auto 1.5rem auto',
                    animation: 'spin 1s linear infinite',
                    boxShadow: '0 0 15px rgba(139, 92, 246, 0.3)'
                  }}></div>

                  <p style={{
                    fontSize: '1rem',
                    fontWeight: 600,
                    color: '#fff',
                    marginBottom: '0.5rem',
                    letterSpacing: '-0.01em',
                    transition: 'all 0.3s'
                  }}>
                    {progressMessage}
                  </p>

                  <p style={{
                    fontSize: '0.85rem',
                    color: 'var(--text-secondary)',
                    marginBottom: '1.25rem'
                  }}>
                    Seconds elapsed: <span style={{ fontFamily: 'monospace', color: '#60a5fa', fontWeight: 600 }}>{elapsedTime}s</span>
                  </p>

                  {/* Visual Progress Bar */}
                  <div style={{
                    width: '100%',
                    height: '8px',
                    background: '#1e293b',
                    borderRadius: '4px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${progressPercentage}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #3b82f6 0%, #8b5cf6 100%)',
                      borderRadius: '4px',
                      transition: 'width 0.4s ease-out'
                    }}></div>
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.4rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    <span>0%</span>
                    <span>Estimated Progress: {Math.round(progressPercentage)}%</span>
                  </div>

                </div>
              ) : (
                /* Empty Placeholder */
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.3 }}>🧙‍♂️</div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                    Draw in the canvas workspace and click below to materialize your character asset here!
                  </p>
                </div>
              )}

            </div>

            {/* Actions for generated asset */}
            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '10px' }}>
              {resultImage && (
                <button
                  onClick={handleDownload}
                  style={{
                    flex: 1,
                    background: 'rgba(255,255,255,0.08)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.1)',
                    padding: '12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                  onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.15)'}
                  onMouseLeave={(e) => e.target.style.background = 'rgba(255,255,255,0.08)'}
                >
                  📥 Download Asset
                </button>
              )}
            </div>

          </div>

        </div>

        {/* Global Action Button */}
        <div style={{ textAlign: 'center', marginTop: '3.5rem', marginBottom: '2rem' }}>
          <button
            onClick={handleGeneration}
            disabled={loading || modelStatus !== 'ready'}
            style={{
              padding: '16px 40px',
              fontSize: '1.2rem',
              fontWeight: 700,
              color: '#fff',
              background: loading
                ? 'rgba(255,255,255,0.05)'
                : modelStatus !== 'ready'
                  ? 'rgba(255,255,255,0.05)'
                  : 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
              border: modelStatus === 'warming' ? '1px solid rgba(99,102,241,0.3)' : 'none',
              borderRadius: '12px',
              cursor: (loading || modelStatus !== 'ready') ? 'not-allowed' : 'pointer',
              boxShadow: (loading || modelStatus !== 'ready') ? 'none' : '0 10px 25px -5px rgba(139, 92, 246, 0.4)',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              letterSpacing: '-0.01em',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px'
            }}
            onMouseEnter={(e) => {
              if (!loading && modelStatus === 'ready') {
                e.target.style.transform = 'translateY(-2px)';
                e.target.style.boxShadow = '0 12px 28px -3px rgba(139, 92, 246, 0.5)';
              }
            }}
            onMouseLeave={(e) => {
              if (!loading && modelStatus === 'ready') {
                e.target.style.transform = 'none';
                e.target.style.boxShadow = '0 10px 25px -5px rgba(139, 92, 246, 0.4)';
              }
            }}
          >
            {loading ? (
              <span>🎨 Painting Your Character... ({elapsedTime}s)</span>
            ) : modelStatus === 'warming' ? (
              <span>⏳ Warming up GPU... please wait</span>
            ) : modelStatus === 'error' ? (
              <span>⚠️ Backend Offline — check Modal deployment</span>
            ) : (
              <span>🚀 Transform to Character!</span>
            )}
          </button>

        </div>

      </div>
    </div>
  );
}
