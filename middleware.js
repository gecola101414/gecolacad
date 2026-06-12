export const config = {
  // Applica questa regola a tutte le rotte e file del programma
  matcher: '/(.*)',
};

export default function middleware(request) {
  // Estrai l'IP del client tramite gli header standard usati da Vercel
  const clientIp = request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for') || "IP_Sconosciuto";
  
  // ==========================================
  // MILITARY SECURITY: IP WHITELIST SETTINGS
  // ==========================================
  const allowedIps = ['82.180.59.135'];
  
  // Se l'IP non è contenuto nella lista, blocca i contenuti
  if (!allowedIps.includes(clientIp)) {
    return new Response(
      `<div style="font-family: monospace; padding: 20px; color: #dc2626;">
        <h1>403 - Forbidden</h1>
        <p><b>Accesso negato - Rete non autorizzata.</b></p>
        <p>Il tuo indirizzo IP (${clientIp}) non compare nella whitelist della rete militare.</p>
      </div>`, 
      {
        status: 403,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      }
    );
  }
}
