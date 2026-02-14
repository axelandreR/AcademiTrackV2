import React from 'react';

const SkeletonGrid: React.FC = () => {
    return (
        <div className="w-full h-full flex flex-col space-y-4 p-4 animate-pulse">
            {/* Header placeholder */}
            <div className="h-16 w-full bg-slate-200 rounded-3xl" />

            <div className="flex-1 flex space-x-4">
                {/* Sidebar placeholder */}
                <div className="hidden md:block w-64 h-full bg-slate-200 rounded-3xl" />

                {/* Grid placeholder */}
                <div className="flex-1 grid grid-cols-7 gap-2">
                    {[...Array(7)].map((_, i) => (
                        <div key={i} className="flex flex-col space-y-2">
                            <div className="h-8 bg-slate-200 rounded-xl" />
                            {[...Array(12)].map((_, j) => (
                                <div key={j} className="h-16 bg-slate-100 rounded-xl" />
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default SkeletonGrid;
