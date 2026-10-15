import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Aperture, ArrowUpRight, CheckCircle2, LoaderCircle, Menu, X } from './Icons';
export function Logo() { return <Link className="brand" to="/"><span className="brand-mark"><Aperture size={25}/></span>stillmotion<span className="brand-dot">®</span></Link>; }
export function Header() {
  const [open, setOpen] = useState(false);
  return <header className="site-header"><div className="nav-wrap"><Logo/><button className="icon-button mobile-menu" aria-label="Toggle navigation" onClick={() => setOpen(!open)}>{open ? <X/> : <Menu/>}</button><nav className={open ? 'nav-links open' : 'nav-links'} onClick={() => setOpen(false)}><NavLink to="/" end>Create an experience</NavLink><NavLink to="/how-it-works">How it works</NavLink><NavLink to="/admin" className="library-link">My experiences <ArrowUpRight size={15}/></NavLink></nav></div></header>;
}
export function Footer() { return <footer><Logo/><p>Some moments deserve more than a photograph.</p><span>Made for memories. Built to last.</span></footer>; }
export function Spinner({ text = 'Loading your memory…' }) { return <div className="loading-state"><LoaderCircle className="spin" size={30}/><p>{text}</p></div>; }
export function Notice({ children, type = 'error' }) { return children ? <div role={type === 'error' ? 'alert' : 'status'} className={`notice ${type}`}>{children}</div> : null; }
export function Toast({ message, clear }) { useEffect(() => { if (message) { const timer = setTimeout(clear, 3500); return () => clearTimeout(timer); } }, [message, clear]); return <AnimatePresence>{message && <motion.div className="toast" role="status" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><CheckCircle2 size={19}/>{message}</motion.div>}</AnimatePresence>; }
export function PageHeading({ eyebrow, title, description }) { return <div className="page-heading"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>; }
