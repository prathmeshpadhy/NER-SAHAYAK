import { useEffect, useRef, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { generateBrowserAIResponse } from '../services/askLocalFallback';
import { useTranslation } from '../hooks/useTranslation';


function renderMarkdown(text) {
  if (!text) return null;
  const lines = text.split('\n');
  return lines.map((line, idx) => {
    let content = line;
    const parts = content.split(/(\*\*.*?\*\*)/g);
    const parsedLine = parts.map((part, pIdx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={pIdx}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return <em key={pIdx}>{part.slice(1, -1)}</em>;
      }
      return part;
    });

    if (line.trim().startsWith('• ') || line.trim().startsWith('- ')) {
      return <li key={idx} style={{ marginLeft: 16, marginBottom: 4 }}>{parsedLine.slice(1)}</li>;
    }
    if (line.trim() === '') {
      return <div key={idx} style={{ height: 8 }} />;
    }
    return <p key={idx} style={{ margin: '3px 0' }}>{parsedLine}</p>;
  });
}

function speakText(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const clean = text.replace(/\*\*/g, '').replace(/#/g, '').replace(/•/g, '');
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.rate = 1.0;
  window.speechSynthesis.speak(utterance);
}

export default function AskSahayakModal({ isOpen, onClose }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [modeBadge, setModeBadge] = useState('NER Intelligence');
  const chatEndRef = useRef(null);

  useEffect(() => {
    if (isOpen && messages.length === 0 && user) {
      setMessages([
        {
          sender: 'ai',
          text: `${t('sahayak.hello') || 'Hello'} **${user.name}**! ${t('sahayak.intro1') || 'I am **Ask Sahayak**, your AI assistant for logistics, route safety, and regional intelligence across North East India.'}\n\n` +
            `${t('sahayak.intro2') || 'How can I help you in your'} **${user.role.toUpperCase()}** ${t('sahayak.intro3') || 'workspace today?'}`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }
  }, [isOpen, messages.length, user, t]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  if (!isOpen) return null;

  const handleSend = async (queryToSend) => {
    const q = queryToSend || input;
    if (!q.trim() || loading) return;

    const userMsg = {
      sender: 'user',
      text: q.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!queryToSend) setInput('');
    setLoading(true);

    try {
      const res = await api.askSahayak(q.trim(), { role: user?.role, district: user?.district });
      if (res.mode === 'openapi') {
        setModeBadge(`OpenAPI (${res.model || 'GPT'})`);
      } else {
        setModeBadge('NER Intelligence Engine');
      }

      const aiMsg = {
        sender: 'ai',
        text: res.answer,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        context: res.contextUsed,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (_) {
      // Offline / GitHub Pages fallback — execute client-side Sahayak AI engine
      const res = generateBrowserAIResponse(q.trim(), user || {});
      setModeBadge('Sahayak AI (Client Engine)');
      const aiMsg = {
        sender: 'ai',
        text: res.answer,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        context: res.contextUsed,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } finally {
      setLoading(false);
    }

  };

  const suggestions = [
    t('sahayak.sug1') || 'Safest route Guwahati to Shillong',
    t('sahayak.sug2') || 'Check weather near Nagaon',
    t('sahayak.sug3') || 'Active landslide & flood reports',
    t('sahayak.sug4') || 'My workspace status',
    t('sahayak.sug5') || 'Emergency helpline numbers',
  ];

  return (
    <div className="ask-modal-overlay" onClick={onClose}>
      <div className="ask-modal-container" onClick={(e) => e.stopPropagation()}>
        <header className="ask-modal-header">
          <div className="ask-modal-title">
            <div className="ask-avatar-icon">✦</div>
            <div>
              <h3>{t('sahayak.title') || 'Ask Sahayak AI'}</h3>
              <div className="ask-status">
                <span className="dot-live" />
                <span>{modeBadge}</span>
              </div>
            </div>
          </div>
          <button className="ask-close-btn" onClick={onClose} aria-label={t('common.close') || 'Close'}>✕</button>
        </header>

        <div className="ask-modal-suggestions">
          {suggestions.map((s, idx) => (
            <button key={idx} className="ask-chip" onClick={() => handleSend(s)} disabled={loading}>
              {s}
            </button>
          ))}
        </div>

        <div className="ask-messages-body">
          {messages.map((m, idx) => (
            <div key={idx} className={`ask-bubble-wrapper ${m.sender}`}>
              <div className="ask-bubble">
                <div className="ask-bubble-meta">
                  <span>{m.sender === 'user' ? user?.name || t('sahayak.you') || 'You' : t('sahayak.title') || 'Ask Sahayak'}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {m.sender === 'ai' && (
                      <button onClick={() => speakText(m.text)} className="speech-btn" title={t('sahayak.listen') || 'Listen to answer'}>
                        🔊 {t('sahayak.listenBtn') || 'Listen'}
                      </button>
                    )}
                    <time>{m.time}</time>
                  </div>
                </div>
                <div className="ask-bubble-content">
                  {renderMarkdown(m.text)}
                </div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="ask-bubble-wrapper ai">
              <div className="ask-bubble loading">
                <div className="typing-indicator">
                  <span /><span /><span />
                </div>
                <span className="loading-text">{t('sahayak.analyzing') || 'Analyzing network & live weather data…'}</span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <footer className="ask-modal-footer">
          <form onSubmit={(e) => { e.preventDefault(); handleSend(); }}>
            <input
              type="text"
              placeholder={t('sahayak.placeholder') || 'Ask about routes, weather, active landslides, cargo...'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              autoFocus
            />
            <button type="submit" disabled={!input.trim() || loading}>
              {t('sahayak.send') || 'Send ➔'}
            </button>
          </form>
        </footer>
      </div>
    </div>
  );
}
