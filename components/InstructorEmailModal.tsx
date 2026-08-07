import React, { useState } from 'react';
import { Mail, X, Copy, Check, AlertTriangle, ExternalLink } from 'lucide-react';
import { InstructorEmailSummary } from '../services/instructorEmailSummary';

interface InstructorEmailModalProps {
    isOpen: boolean;
    onClose: () => void;
    summary: InstructorEmailSummary | null;
}

const formatDate = (d: Date) => d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const shortDay = (d: string) => d.slice(0, 3);

const InstructorEmailModal: React.FC<InstructorEmailModalProps> = ({ isOpen, onClose, summary }) => {
    const [copied, setCopied] = useState(false);

    if (!isOpen || !summary) return null;

    const hasVariation = summary.variations.length > 1;

    const handleCopy = async () => {
        try {
            const ClipboardItemCtor = (window as any).ClipboardItem;
            if (navigator.clipboard && ClipboardItemCtor) {
                const item = new ClipboardItemCtor({
                    'text/plain': new Blob([summary.bodyText], { type: 'text/plain' }),
                    'text/html': new Blob([summary.bodyHtml], { type: 'text/html' }),
                });
                await navigator.clipboard.write([item]);
            } else {
                await navigator.clipboard.writeText(summary.bodyText);
            }
        } catch {
            try { await navigator.clipboard.writeText(summary.bodyText); } catch { /* portapapeles no disponible */ }
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
    };

    const mailtoHref = `mailto:?subject=${encodeURIComponent(summary.subject)}`;

    return (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
            <div className="bg-white rounded-[40px] shadow-2xl max-w-3xl w-full flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in duration-300">
                <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex items-start justify-between">
                    <div className="flex items-center space-x-4">
                        <div className="p-3 bg-blue-100 text-blue-600 rounded-2xl"><Mail size={24} /></div>
                        <div>
                            <h3 className="text-2xl font-black text-slate-900 leading-tight">Resumen para Correo</h3>
                            <p className="text-slate-500 text-sm font-medium">{summary.instructorName} · Periodo {summary.periodo}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 rounded-xl hover:bg-white flex items-center justify-center text-slate-400 hover:text-slate-900 transition-all shadow-sm active:scale-95">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-8 overflow-y-auto space-y-6">
                    {hasVariation && (
                        <div className="bg-rose-50 border border-rose-200 rounded-3xl p-5">
                            <div className="flex items-center gap-2 mb-3">
                                <AlertTriangle size={16} className="text-rose-600" />
                                <span className="text-xs font-black text-rose-700 uppercase tracking-widest">El horario varía durante el periodo</span>
                            </div>
                            <ul className="space-y-1.5">
                                {summary.variations.map((v, idx) => (
                                    <li key={idx} className="text-sm text-rose-800">
                                        Del <strong>{formatDate(v.startDate)}</strong> al <strong>{formatDate(v.endDate)}</strong>: clases los días{' '}
                                        <strong>{v.days.map(shortDay).join(', ')}</strong>.
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="overflow-x-auto rounded-2xl border border-slate-100">
                        <table className="w-full min-w-[640px] text-left text-xs">
                            <thead>
                                <tr className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    <th className="px-4 py-3">NRC</th>
                                    <th className="px-4 py-3">Curso</th>
                                    <th className="px-4 py-3">Ambiente</th>
                                    <th className="px-4 py-3">Días</th>
                                    <th className="px-4 py-3">Horario</th>
                                    <th className="px-4 py-3">Inicio</th>
                                    <th className="px-4 py-3">Fin</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {summary.courseRows.map((r, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50/80">
                                        <td className="px-4 py-3 font-bold text-slate-700">{r.nrc}</td>
                                        <td className="px-4 py-3 text-slate-600">{r.courseName}</td>
                                        <td className="px-4 py-3 text-slate-600">{r.building} - {r.room}</td>
                                        <td className="px-4 py-3 text-slate-600">{r.days.map(shortDay).join(', ')}</td>
                                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.startTime}-{r.endTime}</td>
                                        <td className="px-4 py-3 text-slate-500">{formatDate(r.startDate)}</td>
                                        <td className="px-4 py-3 text-slate-500">{formatDate(r.endDate)}</td>
                                    </tr>
                                ))}
                                {summary.courseRows.length === 0 && (
                                    <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-xs font-bold">Sin cursos académicos asignados.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="p-8 border-t border-slate-100 flex flex-col sm:flex-row items-center gap-3">
                    <button
                        onClick={handleCopy}
                        className={`flex-1 w-full sm:w-auto flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg ${copied ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
                    >
                        {copied ? <Check size={16} /> : <Copy size={16} />}
                        {copied ? 'Copiado — pégalo en tu correo' : 'Copiar contenido del correo'}
                    </button>
                    <a
                        href={mailtoHref}
                        className="flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl font-black text-xs uppercase tracking-widest border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-all w-full sm:w-auto"
                    >
                        <ExternalLink size={16} />
                        Abrir borrador
                    </a>
                </div>
            </div>
        </div>
    );
};

export default InstructorEmailModal;
