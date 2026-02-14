import React from 'react';
import { ChevronRight, Home } from 'lucide-react';

interface BreadcrumbItem {
    label: string;
    onClick?: () => void;
    active?: boolean;
}

interface BreadcrumbsProps {
    items: BreadcrumbItem[];
}

const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ items }) => {
    return (
        <nav className="flex items-center space-x-1 sm:space-x-2 overflow-x-auto no-scrollbar py-1">
            <button
                onClick={() => items[0]?.onClick?.()}
                className="flex items-center text-slate-400 hover:text-indigo-600 transition-colors p-1"
            >
                <Home size={14} />
            </button>

            {items.map((item, index) => (
                <React.Fragment key={index}>
                    <ChevronRight size={12} className="text-slate-300 shrink-0" />
                    <button
                        onClick={item.onClick}
                        disabled={item.active}
                        className={`text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap px-2 py-1 rounded-md transition-all ${item.active
                                ? 'bg-indigo-50 text-indigo-600 cursor-default'
                                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 active:scale-95'
                            }`}
                    >
                        {item.label}
                    </button>
                </React.Fragment>
            ))}
        </nav>
    );
};

export default Breadcrumbs;
