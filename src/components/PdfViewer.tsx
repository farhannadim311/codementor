// PDF Viewer Component - Displays uploaded PDF assignments
import { useState } from 'react';
import { FileText, X, Maximize2, Minimize2 } from 'lucide-react';
import './PdfViewer.css';

interface PdfViewerProps {
    pdf: { name: string; content: string };
    onClose: () => void;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({ pdf, onClose }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className={`pdf-viewer ${isExpanded ? 'expanded' : ''}`}>
            <div className="pdf-header">
                <div className="pdf-title">
                    <FileText size={16} />
                    <span>{pdf.name}</span>
                </div>
                <div className="pdf-actions">
                    <button
                        className="pdf-action-btn"
                        onClick={() => setIsExpanded(!isExpanded)}
                        title={isExpanded ? 'Minimize' : 'Maximize'}
                    >
                        {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                    </button>
                    <button
                        className="pdf-action-btn close"
                        onClick={onClose}
                        title="Close PDF"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>
            <div className="pdf-content">
                <iframe
                    src={pdf.content}
                    title={pdf.name}
                    className="pdf-iframe"
                />
            </div>
        </div>
    );
};

export default PdfViewer;
