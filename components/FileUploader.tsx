
import React, { useRef, useState } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { parseExcelFile, ParseResult } from '../services/excelParser';
import { useData } from '../context/DataContext';

interface FileUploaderProps {
  onDataLoaded: (result: ParseResult) => void;
}

const FileUploader: React.FC<FileUploaderProps> = ({ onDataLoaded }) => {
  const { careersMap } = useData();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setFileName(file.name);

    try {
      const result = await parseExcelFile(file, careersMap);
      onDataLoaded(result);
    } catch (err) {
      console.error(err);
      setError('Error al procesar el archivo. Asegúrate de incluir la hoja "Programación".');
    } finally {
      setLoading(false);
    }
  };

  const triggerInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-8 bg-white rounded-3xl shadow-2xl border-2 border-dashed border-slate-200 hover:border-blue-400 transition-all group">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept=".xlsx, .xls" 
        className="hidden" 
      />
      
      <div className="flex flex-col items-center text-center space-y-6">
        <div className="p-5 bg-blue-50 rounded-3xl text-blue-600 group-hover:scale-110 transition-transform">
          <Upload size={56} />
        </div>
        
        <div>
          <h3 className="text-2xl font-black text-slate-800 tracking-tight">Cargar Programación</h3>
          <p className="text-slate-500 text-sm mt-2 font-medium">Sube el archivo Excel de horarios (Instructores y Aulas se cargan desde sus propias páginas)</p>
        </div>

        <button 
          onClick={triggerInput}
          disabled={loading}
          className="px-10 py-4 bg-slate-900 text-white font-black rounded-2xl hover:bg-blue-700 active:scale-95 transition-all flex items-center space-x-3 disabled:opacity-50 shadow-xl shadow-slate-200"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <FileText size={22} />
          )}
          <span>{loading ? 'Sincronizando...' : 'Seleccionar Archivo Excel'}</span>
        </button>

        {fileName && !error && !loading && (
          <div className="flex items-center space-x-2 text-emerald-600 bg-emerald-50 px-5 py-2.5 rounded-full text-sm font-black border border-emerald-100">
            <CheckCircle size={18} />
            <span>{fileName} listo para procesar</span>
          </div>
        )}

        {error && (
          <div className="flex items-center space-x-2 text-rose-600 bg-rose-50 px-5 py-2.5 rounded-full text-sm font-black border border-rose-100">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileUploader;
