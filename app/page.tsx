"use client";
import { useState, useRef } from 'react';

export default function Home() {
  const [inputs, setInputs] = useState({ ad: '', url: '' });
  const [isImage, setIsImage] = useState(false); // Track if input is an image
  const [output, setOutput] = useState<{personalized: string} | null>(null);
  const [loading, setLoading] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle image upload and convert to Base64
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setInputs({ ...inputs, ad: reader.result as string });
        setIsImage(true);
      };
      reader.readAsDataURL(file); // This triggers onloadend
    }
  };

  const clearImage = () => {
    setIsImage(false);
    setInputs({ ...inputs, ad: '' });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const runPersonalization = async () => {
    if (!inputs.ad || !inputs.url) return alert("Please provide an Ad and a URL.");
    
    setLoading(true);
    try {
      const res = await fetch('/api/personalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          adCreative: inputs.ad, 
          landingPageUrl: inputs.url,
          isImage // Send the flag to the backend
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setOutput(data);
    } catch (error) {
      console.error("Failed to personalize:", error);
      alert("Failed to personalize the page. Check console.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="h-screen bg-slate-950 text-white flex flex-col">
      <nav className="p-4 border-b border-slate-800 bg-slate-900 flex gap-4 items-end z-10">
        <div className="flex-[2]">
          <label className="text-[10px] font-bold text-blue-400 uppercase">Ad Creative / Goal</label>
          <div className="flex gap-2 mt-1">
            <input 
              className="flex-1 bg-slate-800 border border-slate-700 p-2 rounded text-sm outline-none focus:border-blue-500 disabled:opacity-50" 
              placeholder={isImage ? "Image uploaded successfully" : "e.g. Free trial for startup founders"}
              value={isImage ? "Image ready for analysis 🖼️" : inputs.ad}
              onChange={e => setInputs({...inputs, ad: e.target.value})} 
              disabled={isImage}
            />
            
            {/* File Upload Button */}
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="bg-slate-700 px-3 rounded text-xs hover:bg-slate-600 transition-colors font-semibold"
            >
              📷 Upload Image
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*" 
              onChange={handleImageUpload} 
            />

            {/* Clear Image Button */}
            {isImage && (
              <button 
                onClick={clearImage}
                className="bg-red-900/40 text-red-400 px-3 rounded text-xs hover:bg-red-900 transition-colors"
                title="Remove Image"
              >
                ✕
              </button>
            )}
          </div>
        </div>
        
        <div className="flex-1">
          <label className="text-[10px] font-bold text-blue-400 uppercase">Target URL</label>
          <input 
            className="w-full bg-slate-800 border border-slate-700 p-2 rounded mt-1 text-sm outline-none focus:border-blue-500" 
            placeholder="https://example.com"
            value={inputs.url}
            onChange={e => setInputs({...inputs, url: e.target.value})} 
          />
        </div>
        
        <button 
          onClick={runPersonalization} 
          disabled={loading} 
          className="bg-blue-600 px-8 py-2 rounded font-bold hover:bg-blue-500 disabled:opacity-50 transition-all shadow-lg"
        >
          {loading ? "Optimizing..." : "Generate Variant"}
        </button>
      </nav>

      <div className="flex-1 relative bg-slate-900">
        {output ? (
          <div className="w-full h-full flex flex-col">
            <div className="p-1 text-center text-[10px] bg-blue-600 text-white uppercase font-black tracking-widest">
              Live Personalized Variant
            </div>
            <iframe 
              srcDoc={output.personalized} 
              className="w-full h-full bg-white border-none" 
              title="Personalized View"
            />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center flex-col gap-4">
            <div className="text-slate-500 font-medium tracking-tight">
              {loading ? "Analyzing Landing Page Structure..." : "Enter details to see the optimized variant"}
            </div>
            {!loading && <div className="w-12 h-1 bg-slate-800 rounded-full" />}
          </div>
        )}
      </div>
    </main>
  );
}