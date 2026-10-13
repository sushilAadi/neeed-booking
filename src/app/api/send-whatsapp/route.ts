import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const {
      patientPhone,
      doctorPhone,
      patientName,
      doctorName,
      date,
      time,
      type,
    } = await req.json();

    const openwaUrl =
      process.env.OPENWA_API_URL || "http://localhost:2785/api/sendMessage";
    const apiKey = process.env.OPENWA_API_KEY;

    // Helper to format phone number to OpenWA chatId format (e.g. 1234567890@c.us)
    const formatChatId = (phone: string) => {
      const clean = phone.replace(/[^\d]/g, "");
      return clean ? `${clean}@c.us` : null;
    };

    const clientChatId = formatChatId(patientPhone);
    const doctorChatId = formatChatId(doctorPhone || "1234567890"); // Default fallback if no number exists

    const clientMessage = `Hi ${patientName}, your appointment with ${doctorName} has been booked successfully for ${date} at ${time} (${
      type === "online" ? "Online Call" : "Offline Visit"
    }). Thank you!`;
    const doctorMessage = `Hello ${doctorName}, a new appointment has been requested by ${patientName} on ${date} at ${time} (${
      type === "online" ? "Online Call" : "Offline Visit"
    }).`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const requests = [];

    // Send Client Confirmation
    if (clientChatId) {
      requests.push(
        fetch(openwaUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            chatId: clientChatId,
            contentType: "string",
            content: clientMessage,
          }),
        }).catch((e) =>
          console.error("Failed sending client WhatsApp notification:", e),
        ),
      );
    }

    // Send Doctor Alert
    if (doctorChatId) {
      requests.push(
        fetch(openwaUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            chatId: doctorChatId,
            contentType: "string",
            content: doctorMessage,
          }),
        }).catch((e) =>
          console.error("Failed sending doctor WhatsApp notification:", e),
        ),
      );
    }

    if (requests.length > 0) {
      await Promise.all(requests);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("WhatsApp integration endpoint error:", errorMessage);
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 },
    );
  }
}
