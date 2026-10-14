export const rxNo = (appointmentId: string) =>
  `RX-${appointmentId.slice(0, 8).toUpperCase()}`;
