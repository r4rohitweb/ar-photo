import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Camera } from 'lucide-react';
import { endpoint } from '../lib/api';
import { PageHeading } from '../components/UI';
export default function AR() {
  const { id } = useParams();
  const src = useMemo(() => { const url = new URL(`${import.meta.env.BASE_URL}ar.html`, window.location.href); url.search = new URLSearchParams({ id, api: endpoint('get', { id }) }); return url.href; }, [id]);
  const supported = window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;
  return <main className="page-container guide-page"><PageHeading eyebrow="YOUR PHOTO, IN A NEW DIMENSION" title="A memory you can hold." description="Place your printed photo in good light. Let your camera find its story."/>{supported ? <iframe className="ar-shell" src={src} title="Image-tracked augmented reality camera" allow="camera; autoplay; fullscreen" style={{ border: 0 }}/> : <div className="guide-note" style={{ marginTop: 30 }}><Camera/><p>Camera tracking needs HTTPS and a compatible browser. Open this site over HTTPS to try AR, or enjoy the normal experience below.</p></div>}<Link className="button secondary" style={{ marginTop: 20 }} to={`/watch/${id}`}><ArrowLeft size={16}/> Back to the photo experience</Link><p className="small-note">AR uses real image tracking. Featureless photos and reflections can reduce tracking quality.</p></main>;
}
