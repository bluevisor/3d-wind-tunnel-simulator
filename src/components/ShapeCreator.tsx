/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChangeEvent, DragEvent, MouseEvent, useEffect, useRef, useState } from 'react';
import { Brush, FileImage, Trash2, PenTool, RefreshCw, UploadCloud } from 'lucide-react';
import { Point2D } from '../types';

interface ShapeCreatorProps {
  Nx: number;
  Ny: number;
  onCustomShapeCreated: (points: Point2D[]) => void;
  onImageUploaded: (img: HTMLImageElement | null) => void;
}

export default function ShapeCreator({
  Nx,
  Ny,
  onCustomShapeCreated,
  onImageUploaded,
}: ShapeCreatorProps) {
  const [editorMode, setEditorMode] = useState<'polygon' | 'brush' | 'upload'>('polygon');
  
  // Vector Polygon Points
  const [polyPoints, setPolyPoints] = useState<Point2D[]>([]);
  const polygonCanvasRef = useRef<HTMLCanvasElement>(null);

  // Brush paint matrix (120 x 60)
  const [brushMatrix, setBrushMatrix] = useState<boolean[]>(() => new Array(Nx * Ny).fill(false));
  const brushCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushRadius, setBrushRadius] = useState(3);

  // File upload state
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const canvasWidth = 240;
  const canvasHeight = 120;

  // Redraw Polygon Vector Editor Canvas
  useEffect(() => {
    if (editorMode !== 'polygon') return;
    const canvas = polygonCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background Slate layout
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Grid lines for reference
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let i = 20; i < canvasWidth; i += 20) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, canvasHeight);
      ctx.stroke();
    }
    for (let i = 20; i < canvasHeight; i += 20) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(canvasWidth, i);
      ctx.stroke();
    }

    // Draw reference wind tunnel center lines
    ctx.strokeStyle = '#334155';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(canvasWidth / 3.5, canvasHeight / 2, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw completed custom polyline shapes
    if (polyPoints.length > 0) {
      ctx.strokeStyle = '#10b981'; // Neon green
      ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
      ctx.lineWidth = 2;

      ctx.beginPath();
      // Translate grid coords (120 x 60) to canvas visual coords (240 x 120)
      ctx.moveTo((polyPoints[0].x / Nx) * canvasWidth, (polyPoints[0].y / Ny) * canvasHeight);
      for (let i = 1; i < polyPoints.length; i++) {
        ctx.lineTo((polyPoints[i].x / Nx) * canvasWidth, (polyPoints[i].y / Ny) * canvasHeight);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Highlight anchors
      ctx.fillStyle = '#34d399';
      polyPoints.forEach((p) => {
        ctx.beginPath();
        ctx.arc((p.x / Nx) * canvasWidth, (p.y / Ny) * canvasHeight, 4, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Guide text overlay
    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px monospace';
    ctx.fillText('CLICK CANVASES TO INSERT ANCHORS', 6, 14);
  }, [polyPoints, editorMode, Nx, Ny]);

  // Redraw brush painting canvas
  useEffect(() => {
    if (editorMode !== 'brush') return;
    const canvas = brushCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Draw cells from LBM grid scale (120 x 60)
    ctx.fillStyle = '#10b981';
    for (let y = 0; y < Ny; y++) {
      for (let x = 0; x < Nx; x++) {
        if (brushMatrix[y * Nx + x]) {
          const rx = (x / Nx) * canvasWidth;
          const ry = (y / Ny) * canvasHeight;
          const rw = canvasWidth / Nx;
          const rh = canvasHeight / Ny;
          ctx.fillRect(rx, ry, rw + 0.5, rh + 0.5); // overlapping cells
        }
      }
    }

    // Reference boundary target marker
    ctx.strokeStyle = '#334155';
    ctx.setLineDash([2, 5]);
    ctx.strokeRect(canvasWidth / 6, canvasHeight / 6, (canvasWidth * 2) / 3, (canvasHeight * 2) / 3);
    ctx.setLineDash([]);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px monospace';
    ctx.fillText('DRAG TO BRUSH SOLID BARRIERS', 6, 14);
  }, [brushMatrix, editorMode, Nx, Ny]);

  // 1. Polygon Vector Handlers
  const handlePolygonClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const canvas = polygonCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Convert visual coords to grid coords (120 x 60)
    const gridX = (clickX / canvasWidth) * Nx;
    const gridY = (clickY / canvasHeight) * Ny;

    const updatedPoints = [...polyPoints, { x: gridX, y: gridY }];
    setPolyPoints(updatedPoints);
    onCustomShapeCreated(updatedPoints);
  };

  const clearPolygon = () => {
    setPolyPoints([]);
    onCustomShapeCreated([]);
  };

  const undoPolygonPoint = () => {
    if (polyPoints.length === 0) return;
    const updated = polyPoints.slice(0, -1);
    setPolyPoints(updated);
    onCustomShapeCreated(updated);
  };

  // 2. Painting Brush Handlers
  const handleBrushStart = (e: MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    applyBrushAction(e);
  };

  const handleBrushMove = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    applyBrushAction(e);
  };

  const handleBrushEnd = () => {
    setIsDrawing(false);
  };

  const applyBrushAction = (e: MouseEvent<HTMLCanvasElement>) => {
    const canvas = brushCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const gridX = Math.floor((clickX / canvasWidth) * Nx);
    const gridY = Math.floor((clickY / canvasHeight) * Ny);

    const updatedMatrix = [...brushMatrix];
    const r = brushRadius;

    // Set cells inside brush radius circle to solid/empty
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = gridX + dx;
        const ny = gridY + dy;
        if (nx >= 0 && nx < Nx && ny >= 0 && ny < Ny) {
          if (dx * dx + dy * dy <= r * r) {
            updatedMatrix[ny * Nx + nx] = true;
          }
        }
      }
    }

    setBrushMatrix(updatedMatrix);

    // Convert binary painted matrix to polyline boundaries for custom geometry extrusions
    // We can extract boundaries or pass the exact point list to the simulator.
    // Simplifying: we'll convert the painted matrix cells to a polygon list of their centers
    const activePoints: Point2D[] = [];
    for (let y = 0; y < Ny; y++) {
      for (let x = 0; x < Nx; x++) {
        if (updatedMatrix[y * Nx + x]) {
          // Add cell center points
          activePoints.push({ x: x + 0.5, y: y + 0.5 });
        }
      }
    }

    // Rather than single big closing loop, solver supports reading boolean array brushMatrix directly
    // Let's pass the points as custom coordinates
    onCustomShapeCreated(activePoints);
  };

  const clearBrush = () => {
    const fresh = new Array(Nx * Ny).fill(false);
    setBrushMatrix(fresh);
    onCustomShapeCreated([]);
  };

  // 3. Image Silhouette Upload Handlers
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processSelectedImageFile(e.target.files[0]);
    }
  };

  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processSelectedImageFile(e.dataTransfer.files[0]);
    }
  };

  const processSelectedImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        const urlStr = event.target.result as string;
        setUploadPreview(urlStr);

        const img = new Image();
        img.onload = () => {
          onImageUploaded(img);
        };
        img.src = urlStr;
      }
    };
    reader.readAsDataURL(file);
  };

  const resetUpload = () => {
    setUploadPreview(null);
    onImageUploaded(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div id="shape-creator-container" className="flex flex-col gap-4 border border-slate-800 bg-slate-900/50 p-4 rounded-xl">
      <div className="flex items-center justify-between" id="creator-header">
        <span className="text-slate-300 text-sm font-semibold" id="creator-title">
          Custom Aerodynamic Obstacle Canvas
        </span>
        
        {/* Toggle between Pipelines */}
        <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800" id="mode-tabs">
          <button
            id="tab-polygon"
            onClick={() => setEditorMode('polygon')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md gap-1 flex items-center transition ${editorMode === 'polygon' ? 'bg-slate-800 text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <PenTool size={12} />
            <span>Polygon</span>
          </button>
          <button
            id="tab-brush"
            onClick={() => setEditorMode('brush')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md gap-1 flex items-center transition ${editorMode === 'brush' ? 'bg-slate-800 text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <Brush size={12} />
            <span>Paint</span>
          </button>
          <button
            id="tab-upload"
            onClick={() => setEditorMode('upload')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md gap-1 flex items-center transition ${editorMode === 'upload' ? 'bg-slate-800 text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <FileImage size={12} />
            <span>Upload</span>
          </button>
        </div>
      </div>

      {/* Editor Pipelines Container */}
      <div className="flex flex-col items-center justify-center bg-slate-950/80 p-3 rounded-xl border border-slate-900" id="editor-body">
        
        {/* PIPELINE 1: Vector Polyline Editor */}
        {editorMode === 'polygon' && (
          <div className="flex flex-col gap-3 w-full items-center" id="polygon-pipeline">
            <canvas
              id="polygon-canvas"
              ref={polygonCanvasRef}
              width={canvasWidth}
              height={canvasHeight}
              onClick={handlePolygonClick}
              className="cursor-crosshair rounded-lg border border-slate-800 bg-slate-900 shadow-inner"
            ></canvas>
            <div className="flex justify-between w-full align-center text-[11px] text-slate-400 mt-1" id="polygon-controls">
              <span>Vertex anchors: <strong id="anchor-count">{polyPoints.length}</strong></span>
              <div className="flex gap-2" id="polygon-actions">
                <button
                  id="action-undo-polygon"
                  onClick={undoPolygonPoint}
                  disabled={polyPoints.length === 0}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded transition font-medium"
                >
                  Undo Vertex
                </button>
                <button
                  id="action-clear-polygon"
                  onClick={clearPolygon}
                  className="px-2 py-1 bg-rose-950/60 text-rose-400 hover:bg-rose-950 hover:text-rose-300 rounded flex items-center gap-1 transition"
                >
                  <Trash2 size={11} />
                  <span>Clear All</span>
                </button>
              </div>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed text-center self-stretch" id="polygon-tip">
              💡 Tip: Click points starting left-to-right to form a sleek customized wing. Double lift occurs when drawing convex top edges!
            </p>
          </div>
        )}

        {/* PIPELINE 2: Brush Scribble Canvas */}
        {editorMode === 'brush' && (
          <div className="flex flex-col gap-3 w-full items-center" id="brush-pipeline">
            <canvas
              id="brush-canvas"
              ref={brushCanvasRef}
              width={canvasWidth}
              height={canvasHeight}
              onMouseDown={handleBrushStart}
              onMouseMove={handleBrushMove}
              onMouseUp={handleBrushEnd}
              onMouseLeave={handleBrushEnd}
              className="cursor-pointer rounded-lg border border-slate-800 bg-slate-900 shadow-inner select-none"
            ></canvas>
            
            <div className="flex items-center justify-between w-full text-[11px] text-slate-400 mt-1" id="brush-controls">
              <div className="flex items-center gap-2" id="brush-radius-container">
                <span>Brush Width:</span>
                <input
                  id="brush-radius-slider"
                  type="range"
                  min="1"
                  max="6"
                  value={brushRadius}
                  onChange={(e) => setBrushRadius(parseInt(e.target.value))}
                  className="w-16 accent-emerald-500 cursor-pointer"
                />
                <span id="brush-radius-val" className="font-mono text-emerald-400">{brushRadius}px</span>
              </div>
              <button
                id="action-clear-brush"
                onClick={clearBrush}
                className="px-2 py-1 bg-rose-950/60 text-rose-400 hover:bg-rose-950 hover:text-rose-300 rounded flex items-center gap-1 transition"
              >
                <Trash2 size={11} />
                <span>Clear Paint</span>
              </button>
            </div>
          </div>
        )}

        {/* PIPELINE 3: File Upload Silhouette Extractor */}
        {editorMode === 'upload' && (
          <div className="flex flex-col gap-3 w-full items-center" id="upload-pipeline">
            <input
              id="upload-file-input"
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />

            {!uploadPreview ? (
              <div
                id="upload-dropzone"
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`w-full max-w-[240px] h-[120px] rounded-lg border border-dashed flex flex-col items-center justify-center cursor-pointer transition p-4 text-center ${dragActive ? 'border-emerald-500 bg-emerald-950/10' : 'border-slate-800 bg-slate-900/60 hover:bg-slate-900'}`}
              >
                <UploadCloud className="text-slate-400 w-8 h-8 mb-1.5" id="upload-icon-drag" />
                <span className="text-slate-300 text-xs font-semibold" id="upload-prompt">Drag & Drop Image file</span>
                <span className="text-[10px] text-slate-500 mt-1" id="upload-info">PNG, JPG, SVG with clear backgrounds</span>
              </div>
            ) : (
              <div className="relative w-full max-w-[240px] h-[120px] rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center bg-slate-900" id="upload-preview-container">
                <img
                  id="upload-preview-img"
                  src={uploadPreview}
                  alt="obstacle-silhouette"
                  referrerPolicy="no-referrer"
                  className="max-w-full max-h-full object-contain filter brightness-105"
                />
                
                {/* Reset Image */}
                <button
                  id="action-reset-upload"
                  onClick={resetUpload}
                  className="absolute top-1.5 right-1.5 bg-slate-950/80 hover:bg-slate-950 border border-slate-800 text-slate-300 hover:text-rose-400 p-1.5 rounded-md transition"
                  title="Remove Image"
                >
                  <RefreshCw size={12} />
                </button>
              </div>
            )}
            
            <p className="text-[10.5px] text-slate-500 leading-relaxed text-center self-stretch" id="upload-tip">
              💡 Our server-side extractor instantly reads alpha channels or pixels to construct an equivalent extruded 3D wing profile!
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
