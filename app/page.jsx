'use client';
import React, { useRef, useState, useEffect } from 'react';

export default function CharacterCreator() {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [style, setStyle] = useState('chibi');
  const [loading, setLoading] = useState(false);
  const [resultImage, setResultImage] = useState(null);

  // Define simple shape outline templates to overlay for child tracing guidance
  const templates = {
    blank: [],
    creature: [{x: 256, y: 200, r: 80}, {x: 256, y: 340, r: 100}], // Faint structural circle guides
  };

  useEffect(() => {
    clearCanvas();
  }, []);

  const clearCanvas = (templateKey = 'blank') => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'black'; // Core framework prerequisite
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw faint guide circles if a template is selected
    if (templateKey !== 'blank') {
      ctx.strokeStyle = '#222222';
      ctx.lineWidth = 3;
      templates[templateKey].forEach(circle => {
        ctx.beginPath();
        ctx.arc(circle.x, circle.y, circle.r, 0, 2 * Math.PI);
        ctx.stroke();
      });
    }
    setResultImage(null);
  };

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    
    // Coordinate normalizer supporting both mouse and mobile touch inputs
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'white'; // Matches ControlNet mapping input parameters
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

  const stopDrawing = () => setIsDrawing(false);

  const handleGeneration = async () => {
    setLoading(true);
    const canvas = canvasRef.current;
    const base64Image = canvas.toDataURL('image/png');

    try {
      // REPLACE THIS URL STRING WITH YOUR DEPLOYED MODAL ENDPOINT LINK
      const targetEndpoint = "https://iltafabdulahad--generate-character.modal.run";
      
      const response = await fetch(targetEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Image, style: style }),
      });

      const data = await response.json();
      if (data.status === 'success') {
        setResultImage(data.image);
      } else {
        alert("Generation issue encountered. Please test again.");
      }
    } catch (err) {
      console.error(err);
      alert("Backend connection timeout or error.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: '#111', color: '#fff', minHeight: '100vh', padding: '2rem', fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', textAlign: 'center' }}>
        <h1>✨ AI Cartoon Character Studio ✨</h1>
        <p style={{ color: '#aaa' }}>Draw a creature, pick an artistic theme, and watch your imagination come alive!</p>

        <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', margin: '20px 0' }}>
          <div>
            <label style={{ marginRight: '10px' }}>Artistic Style: </label>
            <select value={style} onChange={(e) => setStyle(e.target.value)} style={{ padding: '8px', background: '#222', color: '#fff', border: '1px solid #444' }}>
              <option value="chibi">3D Pixar Toy Style</option>
              <option value="anime">Classic Japanese Anime</option>
              <option value="watercolor">Soft Watercolor Illustration</option>
            </select>
          </div>
          <div>
            <button onClick={() => clearCanvas('creature')} style={{ background: '#444', padding: '8px 12px', border: 'none', color: '#fff', marginRight: '10px', cursor: 'pointer' }}>Use Template Guide</button>
            <button onClick={() => clearCanvas('blank')} style={{ background: '#d9534f', padding: '8px 12px', border: 'none', color: '#fff', cursor: 'pointer' }}>Reset Canvas</button>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '40px', justifyContent: 'center', marginTop: '30px' }}>
          {/* Drawing Interface frame box */}
          <div style={{ textAlign: 'center' }}>
            <h3>Draw Area (White on Black)</h3>
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
              style={{ border: '3px solid #555', background: 'black', cursor: 'crosshair', borderRadius: '8px', touchAction: 'none' }}
            />
            <br />
            <button
              onClick={handleGeneration}
              disabled={loading}
              style={{ marginTop: '20px', width: '100%', padding: '15px', background: loading ? '#666' : '#0275d8', color: '#fff', fontSize: '1.2rem', border: 'none', borderRadius: '6px', cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              {loading ? '🎨 Magically Transforming Your Art...' : '🚀 Transform to Character!'}
            </button>
          </div>

          {/* Rendered Asset Box Frame */}
          <div style={{ textAlign: 'center' }}>
            <h3>Generated Studio Asset</h3>
            <div style={{ width: '512px', height: '512px', border: '3px dashed #444', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a1a', overflow: 'hidden' }}>
              {resultImage ? (
                <img src={resultImage} alt="AI Result" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (
                <p style={{ color: '#555', padding: '20px' }}>Your rendered character asset will materialize here...</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
