"use client";

import { useEffect, useRef } from "react";

// Hook de polling compartido entre ConversationPanel (comprador) y
// ChatPanel (agente) — fase 1 de tiempo real del chat (ver auditoría: sin
// WebSockets/SSE/infraestructura externa, solo polling mientras el panel
// está abierto y la pestaña visible).
//
// Decisiones de diseño:
// - setTimeout recursivo, no setInterval: el siguiente tick solo se agenda
//   cuando el anterior terminó (éxito o error) — nunca hay dos requests en
//   vuelo al mismo tiempo, y no hace falta trackear un flag de "en curso"
//   aparte ("evitar consultas duplicadas" / "limpiar correctamente").
// - El primer tick se dispara de inmediato (no espera `intervalMs`) para
//   que abrir el panel marque como leído sin demora; los siguientes sí
//   respetan el intervalo. `skipInitialTick` (fase 1.1, badge global del
//   header) desactiva solo este primer tick inmediato para quien ya arrancó
//   con un valor fresco calculado por el servidor en el mismo render —
//   evita una consulta redundante que repetiría, milisegundos después, la
//   misma respuesta. El resto del ciclo (cada `intervalMs`, pausa/resume por
//   visibilidad) no cambia.
// - document.visibilitychange pausa agendar el próximo tick mientras la
//   pestaña está oculta, y dispara uno inmediato al volver a estar visible.
// - Un error puntual (red, servidor) se registra y el ciclo igual agenda
//   el próximo tick — una falla temporal nunca detiene el polling para
//   siempre.
// - `enabled` también sirve para pausar/reanudar por motivos ajenos a la
//   pestaña (fase 1.1: IntersectionObserver fuera del viewport en
//   ConversationPanel) — al pasar de false a true, este mismo efecto se
//   re-ejecuta y dispara un tick inmediato, igual que al montar.
export function useConversationPolling(options: {
  enabled: boolean;
  intervalMs?: number;
  skipInitialTick?: boolean;
  poll: () => Promise<void>;
}) {
  const { enabled, intervalMs = 4500, skipInitialTick = false } = options;
  const pollRef = useRef(options.poll);
  // Asignar en un efecto, no durante el render (mutar un ref en render es
  // un anti-patrón que React ahora marca como error) — corre después de
  // cada render, así pollRef siempre apunta al closure más reciente.
  useEffect(() => {
    pollRef.current = options.poll;
  });

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    // Fase 1.1: distingue "todavía no se tomó la decisión inicial" (puede
    // pasar si la pestaña ya nace oculta — montar en una pestaña de fondo
    // es un caso real, no solo de pruebas) de "ya se tomó, solo falta que
    // vuelva a estar visible". Sin esto, handleVisibilityChange no puede
    // distinguir ambos casos y siempre hace catch-up con un tick()
    // inmediato — exactamente lo que skipInitialTick pide evitar.
    let initialDecisionMade = false;

    async function tick() {
      // Limpiar acá, antes que cualquier return temprano: así timeoutId
      // refleja fielmente "¿hay un tick ya agendado?" incluso cuando este
      // tick se disparó estando la pestaña oculta y no reprograma el
      // siguiente. Sin esto, timeoutId se queda con el id (ya consumido,
      // pero igual "verdadero" en JS) del timer que acaba de correr, y
      // handleVisibilityChange cree que ya hay uno pendiente — por lo que
      // nunca llama a tick() al volver a estar visible, y el polling queda
      // detenido para siempre sin ningún error.
      timeoutId = undefined;
      if (cancelled || document.hidden) return;
      try {
        await pollRef.current();
      } catch (e) {
        console.error("No se pudo actualizar la conversación, se reintentará:", e);
      }
      if (!cancelled && !document.hidden) {
        timeoutId = setTimeout(tick, intervalMs);
      }
    }

    function scheduleInitial() {
      initialDecisionMade = true;
      if (skipInitialTick) {
        timeoutId = setTimeout(tick, intervalMs);
      } else {
        tick();
      }
    }

    function handleVisibilityChange() {
      if (cancelled || document.hidden) return;
      if (!initialDecisionMade) {
        scheduleInitial();
        return;
      }
      if (!timeoutId) tick();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    if (!document.hidden) scheduleInitial();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
    // poll se lee vía pollRef a propósito (ver el efecto de arriba), para
    // no reiniciar el ciclo de polling en cada render.
  }, [enabled, intervalMs, skipInitialTick]);
}
