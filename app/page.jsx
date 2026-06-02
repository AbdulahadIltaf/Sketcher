'use client';
import React, { useRef, useState, useEffect } from 'react';

export default function CharacterCreator() {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [style, setStyle] = useState('chibi');
  const [brushSize, setBrushSize] = useState(8);
  const [loading, setLoading] = useState(false);
  const [resultImage, setResultImage] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  
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

  // Timer for Progress estimation
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
    ctx.strokeStyle = 'white';
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

    try {
      const targetEndpoint = "https://iltafabdulahad--generate-character.modal.run";
      
      const response = await fetch(targetEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Image, style: style }),
      });

      if (!response.ok) throw new Error("Server responded with error status");
      
      const data = await response.json();
      if (data.status === 'success') {
        setResultImage(data.image);
      } else {
        alert("Generation issue encountered. Please test again.");
      }
    } catch (err) {
      console.error(err);
      alert("Backend connection timeout or error. Please check your Modal deployment.");
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
  const progressPercentage = (() => {
    if (!loading) return 0;
    if (elapsedTime < 3) return elapsedTime * 10;
    if (elapsedTime < 10) return 30 + (elapsedTime - 3) * 5;
    if (elapsedTime < 25) return 65 + (elapsedTime - 10) * 1.5;
    return Math.min(87.5 + (elapsedTime - 25) * 0.2, 98);
  })();

  const progressMessage = (() => {
    if (elapsedTime < 3) return "🧠 Instantiating AI Engine...";
    if (elapsedTime < 7) return "🎨 Analyzing sketch outlines...";
    if (elapsedTime < 12) return "✨ Denoising and painting pixels...";
    if (elapsedTime < 18) return "🚀 Finalizing cartoon character...";
    return `⚡ Cold-start active: Booting up GPU container... (${elapsedTime}s elapsed)`;
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
                </select>
              </div>
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
            disabled={loading}
            style={{
              padding: '16px 40px',
              fontSize: '1.2rem',
              fontWeight: 700,
              color: '#fff',
              background: loading 
                ? 'rgba(255,255,255,0.05)'
                : 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
              border: 'none',
              borderRadius: '12px',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: loading ? 'none' : '0 10px 25px -5px rgba(139, 92, 246, 0.4)',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              letterSpacing: '-0.01em',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px'
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.target.style.transform = 'translateY(-2px)';
                e.target.style.boxShadow = '0 12px 28px -3px rgba(139, 92, 246, 0.5)';
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.target.style.transform = 'none';
                e.target.style.boxShadow = '0 10px 25px -5px rgba(139, 92, 246, 0.4)';
              }
            }}
          >
            {loading ? (
              <>
                <span>🎨 Painting Your Character... ({elapsedTime}s)</span>
              </>
            ) : (
              <>
                <span>🚀 Transform to Character!</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
