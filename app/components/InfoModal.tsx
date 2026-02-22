import React from 'react';
import { X } from 'lucide-react';

interface InfoModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
}

export default function InfoModal({ isOpen, onClose, title, children }: InfoModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Overlay */}
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in"
                onClick={onClose}
            />

            {/* Container */}
            <div className="relative bg-white/90 backdrop-blur-md w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden animate-zoom-in border border-white/20">
                {/* Header */}
                <div className="flex items-center justify-between p-4 md:p-6 border-b border-gray-100 bg-white/50">
                    <h2 className="text-xl md:text-2xl font-bold text-gray-800">{title}</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500 hover:text-gray-700"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 md:p-8 overflow-y-auto max-h-[calc(90vh-80px)] custom-scrollbar text-gray-700 leading-relaxed">
                    {children}
                </div>
            </div>
        </div>
    );
}
