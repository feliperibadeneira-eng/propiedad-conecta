// Arma un enlace wa.me correcto (sección 28): solo dígitos, con código de
// país. Si el teléfono no trae código de país, asumimos Ecuador (+593) y
// quitamos el 0 inicial típico de los celulares ecuatorianos.
export function buildWhatsAppLink(phone: string, message: string): string {
  let digits = phone.replace(/\D/g, "");
  if (!digits.startsWith("593")) {
    digits = digits.replace(/^0/, "");
    digits = `593${digits}`;
  }
  const text = encodeURIComponent(message);
  return `https://wa.me/${digits}?text=${text}`;
}

export function agentToBuyerMessage(params: {
  buyerName: string;
  agentName: string;
  propertyType: string;
  zone: string;
}): string {
  return `Hola ${params.buyerName}, soy ${params.agentName}. Vi que estás buscando ${params.propertyType} en ${params.zone}. Tengo algunas opciones que podrían interesarte.`;
}
