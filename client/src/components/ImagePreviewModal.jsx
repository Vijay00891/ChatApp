import React, { useState } from 'react';
import { X, ZoomIn, ZoomOut } from 'lucide-react';
import Avatar from './Avatar';

export default function ImagePreviewModal({ isOpen, onClose, src, name }) {
  const [zoom, setZoom] = useState(1);

  if (!isOpen) return null;

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.5, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.5, 1));

  return (
    <div 
      className="fixed inset-0 bg-black/90 z-[60] flex flex-col animate-fade-in"
    >
      <div className="flex justify-between items-center p-4">
        <h3 className="text-white font-ui font-medium text-lg">{name}</h3>
        <div className="flex items-center gap-4">
          <button 
            onClick={handleZoomIn}
            className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition"
          >
            <ZoomIn className="w-5 h-5" />
          </button>
          <button 
            onClick={handleZoomOut}
            className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition"
          >
            <ZoomOut className="w-5 h-5" />
          </button>
          <div className="w-px h-6 bg-white/20 mx-2" />
          <button 
            onClick={onClose}
            className="p-2 bg-white/10 hover:bg-white/20 hover:text-red-400 rounded-full text-white transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>
      
      <div 
        className="flex-1 flex items-center justify-center p-4 overflow-hidden"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div 
          className="transition-transform duration-200 ease-out flex items-center justify-center"
          style={{ transform: `scale(${zoom})` }}
        >
          {src ? (
            <img 
              src={src} 
              alt={name} 
              className="max-w-full max-h-[80vh] object-contain rounded shadow-2xl" 
              style={{ maxWidth: '512px', maxHeight: '512px' }}
            />
          ) : (
            <Avatar name={name} size={512} className="shadow-2xl" />
          )}
        </div>
      </div>
    </div>
  );
}
