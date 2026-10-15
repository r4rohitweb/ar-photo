import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, mediaUrl } from '../lib/api';
import MemoryPlayer from '../components/MemoryPlayer';
import { Camera, Heart, Play } from 'lucide-react';
import { Notice, Spinner } from '../components/UI';
export default function Watch() {
  const { id } = useParams(), [experience, setExperience] = useState(null), [error, setError] = useState(''); const recorded = useRef('');
  useEffect(() => { let live = true; setExperience(null); setError(''); api('get', { params: { id } }).then(data => { if (live) setExperience(data.experience); }).catch(e => live && setError(e.message)); return () => { live = false; }; }, [id]);
  useEffect(() => { if (experience && recorded.current !== id) { recorded.current = id; api('scan', { method: 'POST', params: { id } }).catch(() => {}); } }, [experience, id]);
  return <main className="watch-page"><div className="watch-intro"><span className="eyebrow">SOME MOMENTS STAY WITH US</span><h1>{experience?.title || 'A memory is waiting.'}</h1><p>Stay a little. Watch this moment come to life.</p></div><Notice>{error}</Notice>{!experience && !error && <Spinner/>}{experience && <><div className="watch-frame"><MemoryPlayer key={id} image={mediaUrl(experience.image_path)} video={mediaUrl(experience.video_path)} width={experience.image_width} height={experience.image_height} autoPlay/></div><p className="watch-hint"><Play size={14}/> Tap to play · Sound is off by default</p><Link className="button secondary" to={`/ar/${id}`}><Camera size={17}/> View in AR</Link><p className="small-note">Point your camera at the printed photo.</p></>}<Link className="watch-create" to="/">Make a living memory of your own <span>→</span></Link></main>;
}
