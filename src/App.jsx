import { Component, Suspense, lazy } from 'react';
import { Route, Routes, Link, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { Header, Footer, Spinner } from './components/UI';
import Create from './pages/Create';
const Preview = lazy(() => import('./pages/Preview')), Watch = lazy(() => import('./pages/Watch')), Admin = lazy(() => import('./pages/Admin')), HowItWorks = lazy(() => import('./pages/HowItWorks')), AR = lazy(() => import('./pages/AR'));
class ErrorBoundary extends Component { state = { failed: false }; static getDerivedStateFromError() { return { failed: true }; } render() { return this.state.failed ? <main className="page-container"><h1>This memory needs a moment.</h1><p>The page encountered an unexpected error. Refresh to try again.</p><button className="button primary" onClick={() => window.location.reload()}>Refresh page</button></main> : this.props.children; } }
export default function App() { const location = useLocation(); useEffect(() => { window.scrollTo(0,0); }, [location.pathname]); return <ErrorBoundary><Header/><Suspense fallback={<Spinner/>}><Routes><Route path="/" element={<Create/>}/><Route path="/preview/:id" element={<Preview/>}/><Route path="/watch/:id" element={<Watch/>}/><Route path="/ar/:id" element={<AR/>}/><Route path="/admin" element={<Admin/>}/><Route path="/how-it-works" element={<HowItWorks/>}/><Route path="*" element={<main className="page-container"><h1>This page wandered off.</h1><Link to="/">Create a memory instead →</Link></main>}/></Routes></Suspense><Footer/></ErrorBoundary>; }
