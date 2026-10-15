import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { download } from '../lib/media';
export function useQR(value) { const [src, setSrc] = useState(''); useEffect(() => { let live = true; setSrc(''); if (value) QRCode.toDataURL(value, { width: 600, margin: 3, errorCorrectionLevel: 'M', color: { dark: '#203d30', light: '#ffffff' } }).then(url => live && setSrc(url)).catch(() => {}); return () => { live = false; }; }, [value]); return src; }
export default function QRCard({ experience, image, children }) { const qr = useQR(experience.qr_code_url); return <div className="printed-photo"><img className="printed-image" src={image} alt={experience.title || 'Your memory'} style={{ aspectRatio: `${experience.image_width} / ${experience.image_height}` }}/><div className="printed-bottom">{qr ? <img className="printed-qr" src={qr} alt="QR code to play this memory"/> : <span className="qr-placeholder"/>}<div><h3>Scan to Bring This Photo to Life</h3><p>A little square. A whole story.</p><span className="print-brand">stillmotion</span></div></div>{children}</div>; }
export function downloadQR(src, id) { if (src) download(src, `stillmotion-qr-${id}.png`); }
