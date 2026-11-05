import React, { useState, useRef, useEffect } from 'react';
import { Bot, Mic, MicOff, Volume2, VolumeX, Sparkles, Send, X, MessageSquare, Zap, ChevronUp, ChevronDown, Info, HelpCircle, Sliders, Play, Trash2, Plus, Calculator, Equal } from 'lucide-react';
import { parseGecoCommand, getNamedMeasures, saveNamedMeasure, deleteNamedMeasure, evalMathExpression } from '../utils/gecoParser';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  isOffline?: boolean;
}

interface GecoAssistantProps {
  activeTool: string;
  setActiveTool: (tool: string) => void;
  entitiesCount: number;
  lastInsertedParameter: { type: 'radius' | 'length' | 'thickness' | 'offset'; value: number; isLocked?: boolean } | null;
  onUpdateParameter: (param: { type: 'radius' | 'length' | 'thickness' | 'offset'; value: number; isLocked?: boolean }) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export const GecoAssistant: React.FC<GecoAssistantProps> = ({
  activeTool,
  setActiveTool,
  entitiesCount,
  lastInsertedParameter,
  onUpdateParameter,
  isOpen,
  onToggle
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Ciao! Sono Geco, il tuo assistente CAD virtuale offline & online. Pronuncia la parola "Geco" o dimmi direttamente una misura (es. "150", "due e mezzo", "raggio 30") per associarla subito all\'input!',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isContinuousListening, setIsContinuousListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showKeywordsGuide, setShowKeywordsGuide] = useState(false);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);

  // Voice synthesis state for natural human browser voices
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>(() => {
    return localStorage.getItem('geco_voice_uri') || '';
  });
  const [voicePitch, setVoicePitch] = useState<number>(() => {
    const p = localStorage.getItem('geco_voice_pitch');
    return p ? parseFloat(p) : 1.0;
  });
  const [voiceRate, setVoiceRate] = useState<number>(() => {
    const r = localStorage.getItem('geco_voice_rate');
    return r ? parseFloat(r) : 1.02;
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  const [refreshKey, setRefreshKey] = useState(0);

  const findSurroundingLabel = (text: string, num: number): string => {
    if (!text) return `quota ${num}`;

    // Check for quote pattern e.g. "Muro Nord": 4.5
    const quoteMatch = text.match(/["'«]([^"'»]+)["'»]/);
    if (quoteMatch && quoteMatch[1]) {
      return quoteMatch[1].trim().toLowerCase();
    }

    const clean = text.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()"]/g, ' ');
    const words = clean.split(/\s+/).filter(Boolean);
    const numStr = num.toString();

    const numIndex = words.findIndex(w => w === numStr || parseFloat(w.replace(',', '.')) === num);
    if (numIndex !== -1) {
      const stopWords = new Set([
        'fatto', 'imposta', 'impostato', 'impostata', 'risultato', 'misura', 'quota',
        'a', 'da', 'di', 'per', 'e', 'il', 'la', 'un', 'una', 'fatto!', 'risultato:',
        'calcolo:', 'valore', 'lunghezza', 'spessore', 'raggio', 'attivo', 'strumento'
      ]);
      const prevWords = words.slice(Math.max(0, numIndex - 2), numIndex).filter(w => !stopWords.has(w));
      if (prevWords.length > 0) {
        return prevWords.join(' ');
      }
      const nextWords = words.slice(numIndex + 1, numIndex + 3).filter(w => !stopWords.has(w) && !['m', 'cm', 'mm', 'metri', 'centimetri'].includes(w));
      if (nextWords.length > 0) {
        return nextWords.join(' ');
      }
    }
    return `quota ${num}`;
  };

  const handleSelectMeasureInDialog = (val: number | string, explicitLabel?: string, fullMsgText?: string) => {
    const valNum = typeof val === 'number' ? val : parseFloat(val.toString().replace(',', '.'));
    const valStr = typeof val === 'number' ? val.toString() : val.trim();
    if (isNaN(valNum) || valNum <= 0) return;

    // 1. Azzera la finestra di dialogo e imposta unicamente il dato cliccato
    setInputMessage(valStr);

    // 2. Aggiorna immediatamente il parametro CAD a schermo
    onUpdateParameter({
      type: lastInsertedParameter?.type || 'length',
      value: valNum,
      isLocked: true
    });

    // 3. Memorizza associando il dato ad un nome nel record dello storico
    let labelToSave = explicitLabel?.trim().toLowerCase();
    if (!labelToSave && fullMsgText) {
      labelToSave = findSurroundingLabel(fullMsgText, valNum);
    }
    if (!labelToSave || labelToSave.length < 2) {
      labelToSave = `quota ${valStr}`;
    }

    saveNamedMeasure(labelToSave, valNum);
    setRefreshKey(prev => prev + 1);
  };

  const renderInteractiveMessageContent = (text: string) => {
    const numberRegex = /(\b\d+(?:[.,]\d+)?\b)/g;
    const parts = text.split(numberRegex);

    return parts.map((part, idx) => {
      const cleanNum = parseFloat(part.replace(',', '.'));
      if (!isNaN(cleanNum) && cleanNum > 0 && /\d/.test(part)) {
        return (
          <button
            key={idx}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleSelectMeasureInDialog(cleanNum, undefined, text);
            }}
            className="inline-flex items-center gap-0.5 mx-0.5 px-1.5 py-0.2 bg-emerald-100 dark:bg-emerald-900/60 hover:bg-emerald-200 dark:hover:bg-emerald-800 text-emerald-900 dark:text-emerald-100 font-mono font-bold rounded border border-emerald-300 dark:border-emerald-700 transition-all text-[11px] shadow-xs hover:scale-105 active:scale-95 cursor-pointer"
            title={`Clicca per azzerare e impostare ${cleanNum} nella finestra di dialogo e memorizzare nello storico`}
          >
            <Zap className="w-2.5 h-2.5 text-amber-500 fill-amber-500" />
            <span>{part}</span>
          </button>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  // Load browser TTS voices (handles async voice loading in Chrome/Edge/Safari/Firefox)
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (!voices || voices.length === 0) return;

      // Prioritize Italian voices, otherwise list all available
      const italianVoices = voices.filter(v => v.lang.toLowerCase().replace('_', '-').startsWith('it'));
      const voiceList = italianVoices.length > 0 ? italianVoices : voices;

      // Sort voices putting Natural/Google/Neural/Premium/Enhanced first
      voiceList.sort((a, b) => {
        const isANatural = /natural|google|neural|premium|enhanced|siri|alice|cosimo|diego|federica/i.test(a.name);
        const isBNatural = /natural|google|neural|premium|enhanced|siri|alice|cosimo|diego|federica/i.test(b.name);
        if (isANatural && !isBNatural) return -1;
        if (!isANatural && isBNatural) return 1;
        return a.name.localeCompare(b.name);
      });

      setAvailableVoices(voiceList);

      // Auto-select best voice if not saved
      const savedURI = localStorage.getItem('geco_voice_uri');
      if (savedURI && voiceList.some(v => v.voiceURI === savedURI)) {
        setSelectedVoiceURI(savedURI);
      } else if (voiceList.length > 0) {
        const topVoice = voiceList.find(v => /natural|google|neural|premium|enhanced|siri|alice|cosimo/i.test(v.name)) || voiceList[0];
        setSelectedVoiceURI(topVoice.voiceURI);
        try { localStorage.setItem('geco_voice_uri', topVoice.voiceURI); } catch (e) {}
      }
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  // Save voice parameters to localStorage
  const handleSelectVoice = (uri: string) => {
    setSelectedVoiceURI(uri);
    try { localStorage.setItem('geco_voice_uri', uri); } catch (e) {}
  };

  const handleChangePitch = (val: number) => {
    setVoicePitch(val);
    try { localStorage.setItem('geco_voice_pitch', val.toString()); } catch (e) {}
  };

  const handleChangeRate = (val: number) => {
    setVoiceRate(val);
    try { localStorage.setItem('geco_voice_rate', val.toString()); } catch (e) {}
  };

  // Speech Recognition setup (Continuous / Hands-free with "Geco" keyword offline parser)
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (isListening || isContinuousListening) {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.lang = 'it-IT';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.continuous = isContinuousListening;

      recognition.onresult = (event: any) => {
        const text = event.results[event.results.length - 1][0].transcript;
        if (text && text.trim()) {
          setInputMessage(text);
          handleSendMessage(text);
        }
      };

      recognition.onerror = () => {
        if (!isContinuousListening) setIsListening(false);
      };

      recognition.onend = () => {
        if (isContinuousListening && isOpen) {
          try {
            recognition.start();
          } catch (e) {}
        } else {
          setIsListening(false);
        }
      };

      try {
        recognition.start();
      } catch (e) {
        setIsListening(false);
      }

      return () => {
        try {
          recognition.stop();
        } catch (e) {}
      };
    } else {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
    }
  }, [isListening, isContinuousListening, isOpen]);

  const speakText = (text: string) => {
    if (!soundEnabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    
    // Clean text and expand CAD abbreviations for realistic human voice cadence & pauses
    let cleanText = text
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}⚡]/gu, '')
      .replace(/\bcm\b/gi, ' centimetri')
      .replace(/\bm\b/gi, ' metri')
      .replace(/\bmm\b/gi, ' millimetri')
      .replace(/\bCAD\b/gi, ' Cad')
      .replace(/\bOK\b/gi, ' O K');

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'it-IT';
    utterance.rate = voiceRate;
    utterance.pitch = voicePitch;

    const voices = window.speechSynthesis.getVoices();
    let targetVoice = voices.find(v => v.voiceURI === selectedVoiceURI);
    
    if (!targetVoice) {
      targetVoice = voices.find(v => v.lang.toLowerCase().replace('_', '-').startsWith('it') && /natural|google|neural|premium|enhanced/i.test(v.name))
        || voices.find(v => v.lang.toLowerCase().replace('_', '-').startsWith('it'))
        || voices[0];
    }

    if (targetVoice) {
      utterance.voice = targetVoice;
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const handleSendMessage = async (overrideText?: string) => {
    const textToSend = overrideText !== undefined ? overrideText : inputMessage;
    if (!textToSend.trim() || loading) return;

    const userMsg: Message = {
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    if (overrideText === undefined) setInputMessage('');

    // 1. OFFLINE INTRINSIC PARSER CHECK FIRST (Instant zero-latency execution)
    const parsed = parseGecoCommand(textToSend);

    if (parsed.hasMatch) {
      if (parsed.extractedValue !== null) {
        onUpdateParameter({
          type: parsed.parameterType,
          value: parsed.extractedValue,
          isLocked: true
        });

        // Save into named measures if not saved already
        const label = parsed.savedAlias?.name || findSurroundingLabel(textToSend, parsed.extractedValue);
        saveNamedMeasure(label, parsed.extractedValue);
        setRefreshKey(prev => prev + 1);
      }

      if (parsed.suggestedTool) {
        setActiveTool(parsed.suggestedTool);
      }

      const assistantMsg: Message = {
        role: 'assistant',
        content: parsed.responseText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isOffline: true
      };

      setMessages(prev => [...prev, assistantMsg]);
      speakText(parsed.responseText);
      return;
    }

    // 2. FALLBACK TO ONLINE GEMINI AI IF NO EXPLICIT NUMERIC/TOOL COMMAND MATCHED
    setLoading(true);

    try {
      const drawingContext = {
        activeTool,
        entitiesCount,
        lastInsertedParameter,
      };

      const historyPayload = messages.map(m => ({ role: m.role, content: m.content }));

      const res = await fetch('/api/geco', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          drawingContext,
          history: historyPayload
        })
      });

      const data = await res.json();
      if (res.ok) {
        const assistantMsg: Message = {
          role: 'assistant',
          content: data.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages(prev => [...prev, assistantMsg]);
        speakText(data.reply);

        if (data.suggestedAction) {
          if (data.suggestedAction.tool) {
            setActiveTool(data.suggestedAction.tool);
          }
          if (data.suggestedAction.parameter) {
            onUpdateParameter({
              type: data.suggestedAction.parameter.type || 'length',
              value: data.suggestedAction.parameter.value,
              isLocked: true
            });
          }
        }
      } else {
        throw new Error(data.error || 'Errore di connessione a Geco AI');
      }
    } catch (err: any) {
      // Offline fallback when server unavailable
      const fallbackReply = `⚡ Geco Offline: Sto ascoltando! Pronuncia o scrivi un numero (es. "geco 150", "2.5m" o "raggio 30") per impostare la misura.`;
      const errorMsg: Message = {
        role: 'assistant',
        content: fallbackReply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isOffline: true
      };
      setMessages(prev => [...prev, errorMsg]);
      speakText(fallbackReply);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)] bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-emerald-500/30 dark:border-emerald-500/20 flex flex-col overflow-hidden transition-all duration-300 animate-in fade-in slide-in-from-bottom-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <div className="w-9 h-9 rounded-full bg-emerald-500/30 flex items-center justify-center border border-emerald-300/50 shadow-inner">
              <Bot className="w-5 h-5 text-emerald-100" />
            </div>
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 border-2 border-emerald-700 rounded-full animate-pulse" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <h3 className="font-bold text-sm tracking-wide">Geco AI</h3>
              <span className="text-[10px] bg-emerald-500/40 px-1.5 py-0.5 rounded-full font-medium">Stagista CAD</span>
            </div>
            <p className="text-[11px] text-emerald-100/80">Sempre attivo &middot; Pronto al disegno</p>
          </div>
        </div>

        <div className="flex items-center space-x-1">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-1.5 rounded-lg transition-colors ${soundEnabled ? 'bg-emerald-500/30 text-emerald-100' : 'text-emerald-200/50 hover:bg-emerald-500/20'}`}
            title={soundEnabled ? 'Voce attiva' : 'Voce disattivata'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setShowVoiceSettings(!showVoiceSettings)}
            className={`p-1.5 rounded-lg transition-colors ${showVoiceSettings ? 'bg-amber-500/40 text-amber-200 font-bold' : 'text-emerald-100 hover:bg-emerald-500/30'}`}
            title="Impostazioni voce umana e sintesi browser"
          >
            <Sliders className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1.5 rounded-lg text-emerald-100 hover:bg-emerald-500/30 transition-colors"
            title={isMinimized ? 'Espandi' : 'Riduci'}
          >
            {isMinimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button
            onClick={onToggle}
            className="p-1.5 rounded-lg text-emerald-100 hover:bg-rose-500/40 transition-colors"
            title="Chiudi assistente"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Quick Context Bar */}
          <div className="bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1.5 border-b border-emerald-100 dark:border-emerald-900/50 flex items-center justify-between text-[11px] text-emerald-800 dark:text-emerald-300">
            <span className="flex items-center space-x-1">
              <Zap className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              <span>Tool: <strong>{activeTool}</strong></span>
            </span>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setShowKeywordsGuide(!showKeywordsGuide)}
                className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 dark:bg-emerald-900/60 hover:bg-emerald-200 text-emerald-800 dark:text-emerald-200 transition-colors flex items-center gap-1 font-medium"
                title="Guida comandi e parole offline"
              >
                <HelpCircle className="w-3 h-3" />
                <span>Comandi</span>
              </button>
              <button
                onClick={() => setIsContinuousListening(!isContinuousListening)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-all flex items-center space-x-1 ${
                  isContinuousListening 
                    ? 'bg-emerald-600 text-white animate-pulse shadow-sm' 
                    : 'bg-emerald-200/60 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-300'
                }`}
                title="Attiva/disattiva ascolto continuo mani libere"
              >
                <Mic className="w-3 h-3" />
                <span>{isContinuousListening ? 'Mani Libere ON' : 'Mani Libere OFF'}</span>
              </button>
            </div>
          </div>

          {showVoiceSettings && (
            <div className="bg-slate-900 text-slate-100 p-3 text-xs space-y-2.5 border-b border-slate-700 shadow-inner">
              <div className="flex items-center justify-between font-bold text-amber-300">
                <span className="flex items-center gap-1.5">
                  <Volume2 className="w-4 h-4 text-amber-400" />
                  <span>Impostazioni Voce Umana Offline</span>
                </span>
                <button
                  type="button"
                  onClick={() => speakText("Ciao! Sono Geco. Questa è la mia voce umana impostata nel tuo browser.")}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded text-[10px] flex items-center gap-1 font-bold transition-colors shadow-sm"
                >
                  <Play className="w-3 h-3" />
                  <span>Prova Voce</span>
                </button>
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1 font-bold uppercase tracking-wider">
                  Seleziona Voce dal Browser
                </label>
                <select
                  value={selectedVoiceURI}
                  onChange={(e) => handleSelectVoice(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-medium"
                >
                  {availableVoices.length === 0 && (
                    <option value="">Rilevamento voci di sistema...</option>
                  )}
                  {availableVoices.map((v, i) => (
                    <option key={i} value={v.voiceURI}>
                      {v.name} ({v.lang}) {/natural|google|neural|premium|enhanced|siri/i.test(v.name) ? '✨ HD/Natural' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <div className="flex justify-between text-[10px] text-slate-300 font-bold mb-1">
                    <span>Tono / Pitch</span>
                    <span className="text-amber-300">{voicePitch.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.7"
                    max="1.3"
                    step="0.05"
                    value={voicePitch}
                    onChange={(e) => handleChangePitch(parseFloat(e.target.value))}
                    className="w-full accent-amber-400 h-1.5 bg-slate-700 rounded cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[10px] text-slate-300 font-bold mb-1">
                    <span>Velocità / Cadenza</span>
                    <span className="text-amber-300">{voiceRate.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.7"
                    max="1.3"
                    step="0.05"
                    value={voiceRate}
                    onChange={(e) => handleChangeRate(parseFloat(e.target.value))}
                    className="w-full accent-amber-400 h-1.5 bg-slate-700 rounded cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {showKeywordsGuide && (
            <div className="bg-emerald-900/90 text-emerald-50 p-2.5 text-[10px] space-y-1 border-b border-emerald-700">
              <div className="font-bold text-amber-300 flex items-center gap-1">
                <span>⚡ Intelligenza Intrinseca Offline Geco</span>
              </div>
              <p>Ogni volta che pronunci o scrivi un valore, Geco lo associa all'input e lo blocca sullo schermo!</p>
              <div className="grid grid-cols-2 gap-1 text-[9px] pt-1">
                <div className="bg-emerald-950/60 p-1.5 rounded">
                  <span className="font-bold text-emerald-200 block">Misure, Nomi e Calcoli:</span>
                  <span>"150", "100 diviso 2", "50 per 3", "quadrato di 5", "radice di 100", "metà di finestra"</span>
                </div>
                <div className="bg-emerald-950/60 p-1.5 rounded">
                  <span className="font-bold text-emerald-200 block">Strumenti:</span>
                  <span>"linea", "cerchio", "muro", "cancella", "rettangolo"</span>
                </div>
              </div>
            </div>
          )}

          {/* Named Measures Quick Chips */}
          {(() => {
            const namedDict = getNamedMeasures();
            const keys = Object.keys(namedDict);
            if (keys.length === 0) return null;
            return (
              <div key={refreshKey} className="bg-emerald-950/40 dark:bg-emerald-950/80 px-3 py-1.5 border-b border-emerald-800/40 flex items-center gap-1.5 overflow-x-auto text-[10px]">
                <span className="text-amber-400 font-bold shrink-0 flex items-center gap-1">
                  <Calculator className="w-3 h-3 text-amber-400" />
                  <span>Nomi:</span>
                </span>
                {keys.map((k) => (
                  <div key={k} className="flex items-center bg-emerald-800/60 hover:bg-emerald-700/80 text-emerald-100 rounded-full overflow-hidden border border-emerald-600/40 shrink-0 transition-colors shadow-xs">
                    <button
                      type="button"
                      onClick={() => handleSelectMeasureInDialog(namedDict[k], k)}
                      className="px-2 py-0.5 font-mono flex items-center gap-1 text-[10px] hover:text-white"
                      title={`Clicca per azzerare e impostare ${k} (${namedDict[k]}) nella finestra di dialogo e parametro CAD`}
                    >
                      <span>{k}:</span>
                      <span className="text-amber-300 font-bold">{namedDict[k]}</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNamedMeasure(k);
                        setRefreshKey(prev => prev + 1);
                      }}
                      className="pr-1.5 pl-0.5 py-0.5 text-emerald-300/60 hover:text-rose-300 transition-colors"
                      title={`Elimina voce ${k}`}
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Messages Container */}
          <div className="h-80 overflow-y-auto p-4 space-y-3 bg-neutral-50 dark:bg-neutral-950/50">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs shadow-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-emerald-600 text-white rounded-br-none'
                      : 'bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 border border-neutral-200/70 dark:border-neutral-700 rounded-bl-none'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{renderInteractiveMessageContent(msg.content)}</p>
                </div>
                <div className="flex items-center gap-1.5 mt-1 px-1">
                  {msg.isOffline && (
                    <span className="text-[9px] font-bold bg-amber-500/20 text-amber-600 dark:text-amber-300 px-1.5 py-0.2 rounded">
                      Offline Parser
                    </span>
                  )}
                  <span className="text-[10px] text-neutral-400">{msg.timestamp}</span>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center space-x-2 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 rounded-xl w-fit animate-pulse">
                <Sparkles className="w-3.5 h-3.5 animate-spin" />
                <span>Geco sta pensando e disegnando...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Live Math Total Preview Bar */}
          {(() => {
            const mathEval = evalMathExpression(inputMessage);
            if (mathEval !== null && (/[+\-*/]/.test(inputMessage) || inputMessage.trim() !== mathEval.toString())) {
              return (
                <div className="bg-amber-50 dark:bg-amber-950/60 px-3.5 py-1.5 border-t border-amber-200 dark:border-amber-900/50 flex items-center justify-between text-xs text-amber-950 dark:text-amber-200 font-mono shadow-inner animate-fade-in">
                  <div className="flex items-center gap-1.5">
                    <Calculator className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 animate-pulse" />
                    <span>Totale Calcolato: <strong className="text-emerald-600 dark:text-emerald-400 text-sm font-black">{mathEval}</strong></span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSendMessage()}
                    className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded flex items-center gap-1 text-[10px] uppercase shadow-xs transition-transform active:scale-95"
                    title="Totalizza e applica immediatamente all'input del disegno"
                  >
                    <Equal className="w-3 h-3" />
                    <span>Totalizza & Applica</span>
                  </button>
                </div>
              );
            }
            return null;
          })()}

          {/* Input Area */}
          <div className="p-3 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 flex items-center space-x-2">
            <button
              onClick={() => setIsListening(!isListening)}
              className={`p-2 rounded-xl transition-all ${
                isListening
                  ? 'bg-rose-500 text-white animate-pulse shadow-md shadow-rose-500/30'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 hover:text-emerald-600'
              }`}
              title={isListening ? 'Ascolto in corso...' : 'Parla con Geco'}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            <input
              type="text"
              className="flex-1 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3.5 py-2 text-xs text-neutral-800 dark:text-neutral-100 focus:outline-none focus:border-emerald-500 transition-colors font-mono"
              placeholder="E.g. 'Muro Nord 4.5', '150 + 80', 'Finestra 120'..."
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSendMessage();
              }}
            />

            <button
              onClick={() => handleSendMessage()}
              disabled={loading || !inputMessage.trim()}
              className="p-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white rounded-xl shadow-md transition-colors"
              title="Invia messaggio e applica misura"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
};
