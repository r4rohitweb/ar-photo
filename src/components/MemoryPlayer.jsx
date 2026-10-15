import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { LoaderCircle, Pause, Play, RefreshCw, Volume2, VolumeX } from './Icons';
export default function MemoryPlayer({ image, video, width = 4, height = 3, autoPlay = false, onScan }) {
  const ref = useRef(null), scanned = useRef(false), [active, setActive] = useState(false), [loading, setLoading] = useState(false), [muted, setMuted] = useState(true), [error, setError] = useState(''), [ended, setEnded] = useState(false), reduce = useReducedMotion();
  function showVideo() { setActive(true); setLoading(false); setEnded(false); if (!scanned.current) { scanned.current = true; onScan?.(); } }
  async function play() { setError(''); setLoading(true); try { await ref.current.play(); } catch { setLoading(false); setError('Tap play to start. If playback fails, try another browser.'); } }
  useEffect(() => { setActive(false); setEnded(false); scanned.current = false; if (autoPlay) { const timer = setTimeout(() => { ref.current?.play().catch(() => setLoading(false)); }, 1000); return () => clearTimeout(timer); } }, [video, autoPlay]);
  return <div className="player-wrap"><div className="memory-player" style={{ aspectRatio: `${width} / ${height}` }}>
    <img className="player-photo" src={image} alt="The original memory"/>
    <motion.video ref={ref} src={video} poster={image} muted={muted} playsInline preload="auto" animate={{ opacity: active ? 1 : 0 }} transition={{ duration: reduce ? 0 : 0.7 }} onPlaying={showVideo} onWaiting={() => setLoading(true)} onCanPlay={() => setLoading(false)} onEnded={() => { setActive(false); setEnded(true); ref.current.currentTime = 0; }} onPause={() => setActive(false)} onError={() => { setError('This video could not be played. Try an H.264 MP4 in a supported browser.'); setLoading(false); setActive(false); }}/>
    {!active && <button className="play-overlay" aria-label={ended ? 'Replay memory' : 'Play memory'} onClick={play}>{loading ? <LoaderCircle className="spin" size={26}/> : ended ? <RefreshCw size={27}/> : <Play size={27} fill="currentColor"/>}</button>}
    {active && loading && <span className="buffering"><LoaderCircle className="spin"/> Buffering</span>}
    <span className="player-caption">{active ? 'A moment, alive.' : ended ? 'A memory worth replaying.' : 'A moment, waiting to come alive.'}</span>
    <div className="player-controls"><button onClick={() => active ? ref.current.pause() : play()} aria-label={active ? 'Pause video' : 'Play video'}>{active ? <Pause size={17}/> : <Play size={17}/>}</button><button onClick={() => setMuted(!muted)} aria-label={muted ? 'Unmute video' : 'Mute video'}>{muted ? <VolumeX size={17}/> : <Volume2 size={17}/>}</button></div>
  </div>{error && <p role="alert" className="field-error">{error}</p>}</div>;
}
