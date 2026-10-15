import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Camera, Play, ScanLine } from 'lucide-react';
import { api, endpoint, mediaUrl } from '../lib/api';
import { Notice, PageHeading, Spinner } from '../components/UI';
export default function AR() {
  const { id } = useParams();
  const [experience, setExperience] = useState(null), [error, setError] = useState('');
  const recorded = useRef('');
  useEffect(() => {
    let live = true; setExperience(null); setError('');
    api('get', { params: { id } }).then(data => { if (live) setExperience(data.experience); }).catch(error => { if (live) setError(error.message); });
    return () => { live = false; };
  }, [id]);
  useEffect(() => {
    if (experience && recorded.current !== id) {
      recorded.current = id;
      api('scan', { method: 'POST', params: { id } }).catch(() => {});
    }
  }, [experience, id]);
  const src = useMemo(() => { const url = new URL(`${import.meta.env.BASE_URL}ar.html`, window.location.href); url.search = new URLSearchParams({ id, api: endpoint('get', { id }) }); return url.href; }, [id]);
  const supported = window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;
  return <main className="page-container guide-page ar-page">
    <PageHeading eyebrow="YOUR PHOTO, ALIVE IN WEBAR" title="Scan your photo. Relive the moment." description="Open the camera, then point it at the printed photo. Its video will follow the photo as you move."/>
    <Notice>{error}</Notice>
    {!experience && !error && <Spinner text="Finding your photo…"/>}
    {experience && <>
      <div className="ar-reference"><img src={mediaUrl(experience.image_path)} alt="Photo to scan with your camera"/><div><strong>{experience.title}</strong><span><ScanLine size={14}/> Point your camera at this photo, rather than its QR code.</span></div></div>
      {supported ? <iframe key={id} className="ar-shell" src={src} title="Image-tracked augmented reality camera" allow="camera; autoplay; fullscreen" style={{ border: 0 }}/>
        : <div className="guide-note" style={{ marginTop: 30 }}><Camera/><p>Your browser cannot open the AR camera here. Open this link over HTTPS in Safari or Chrome, or watch without the camera below.</p></div>}
      <Link className="button secondary" style={{ marginTop: 20 }} to={`/play/${id}`}><Play size={16}/> Watch without camera</Link>
      <p className="small-note">Allow camera access when asked. Keep the full photo visible in good light.</p>
    </>}
  </main>;
}
