"use client";

import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type RoleType = "client" | "doctor" | "assistant";
export type AppointmentStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "completed"
  | "canceled";
export type BookingType = "online" | "offline";

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  rating: number;
  avatar: string;
  biography: string;
  location: string;
  phoneNumber?: string;
  weeklySchedule: {
    [key: string]: { start: string; end: string; slots: string[] };
  };
}

export interface Appointment {
  id: string;
  patientName: string;
  patientAge: number;
  patientGender: string;
  patientPhone?: string;
  doctorName: string;
  category: string;
  date: string; // Format: "YYYY-MM-DD"
  time: string; // Format: "HH:MM"
  type: BookingType;
  status: AppointmentStatus;
  reason: string;
  createdAt: string;
}

export interface BlockedSlot {
  doctorName: string;
  date: string;
  time: string;
}

export const ALL_SLOTS = [
  "08:30",
  "09:30",
  "10:30",
  "11:30",
  "12:30",
  "13:30",
  "14:30",
  "15:30",
  "16:30",
];

export interface ToastMessage {
  id: string;
  message: string;
  type: "info" | "success" | "warning";
}

interface AppointmentContextType {
  role: RoleType;
  setRole: (role: RoleType) => void;
  doctors: Doctor[];
  selectedDoctor: Doctor;
  setSelectedDoctor: (doctor: Doctor) => void;
  selectedCategory: string;
  setSelectedCategory: (category: string) => void;
  selectedDate: string; // Format: "YYYY-MM-DD"
  setSelectedDate: (date: string) => void;
  appointments: Appointment[];
  bookAppointment: (
    appointment: Omit<Appointment, "id" | "status" | "createdAt">,
  ) => void;
  updateAppointmentStatus: (id: string, status: AppointmentStatus) => void;
  blockedSlots: BlockedSlot[];
  toggleBlockedSlot: (doctorName: string, date: string, time: string) => void;
  setDaySlots: (doctorId: string, dayName: string, slots: string[]) => void;
  addAppointment: (appointment: Appointment) => void;
  toasts: ToastMessage[];
  addToast: (message: string, type: ToastMessage["type"]) => void;
  removeToast: (id: string) => void;
  datesList: {
    dateString: string;
    dayName: string;
    dayNum: number;
    monthName: string;
  }[];
}

const AppointmentContext = createContext<AppointmentContextType | undefined>(
  undefined,
);

// Helper to generate the next 7 days starting from today
const generateDatesList = () => {
  const dates = [];
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const dateString = `${year}-${month}-${day}`;

    dates.push({
      dateString,
      dayName: days[d.getDay()],
      dayNum: d.getDate(),
      monthName: months[d.getMonth()],
    });
  }
  return dates;
};

const INITIAL_DOCTORS: Doctor[] = [
  {
    id: "doc-1",
    name: "Dr. Liza Martin",
    specialty: "Cardiology",
    rating: 5.0,
    avatar:
      "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=300",
    biography:
      "Dr. Liza Martin is a renowned cardiologist with over 12 years of clinical experience. She completed her medical education at Stanford University and specializes in non-invasive cardiology and preventative heart care.",
    location: "123 Main Street, New York, USA",
    phoneNumber: "+15550100001",
    weeklySchedule: {
      Monday: {
        start: "09:00",
        end: "17:00",
        slots: [
          "08:30",
          "09:30",
          "10:30",
          "11:30",
          "12:30",
          "13:30",
          "14:30",
          "15:30",
          "16:30",
        ],
      },
      Tuesday: {
        start: "09:00",
        end: "17:00",
        slots: [
          "08:30",
          "09:30",
          "10:30",
          "11:30",
          "12:30",
          "13:30",
          "14:30",
          "15:30",
          "16:30",
        ],
      },
      Wednesday: {
        start: "09:00",
        end: "17:00",
        slots: [
          "08:30",
          "09:30",
          "10:30",
          "11:30",
          "12:30",
          "13:30",
          "14:30",
          "15:30",
          "16:30",
        ],
      },
      Thursday: {
        start: "09:00",
        end: "17:00",
        slots: [
          "08:30",
          "09:30",
          "10:30",
          "11:30",
          "12:30",
          "13:30",
          "14:30",
          "15:30",
          "16:30",
        ],
      },
      Friday: {
        start: "09:00",
        end: "17:00",
        slots: [
          "08:30",
          "09:30",
          "10:30",
          "11:30",
          "12:30",
          "13:30",
          "14:30",
          "15:30",
          "16:30",
        ],
      },
    },
  },
  {
    id: "doc-2",
    name: "Dr. Robert Wilson",
    specialty: "Cardiology",
    rating: 4.5,
    avatar:
      "https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=80&w=300",
    biography:
      "Dr. Robert Wilson is an expert in cardiovascular health, focusing on pediatric cardiology and valvular heart disease. He has worked at Columbia University Medical Center for 8 years.",
    location: "456 Lexington Ave, New York, USA",
    phoneNumber: "+15550100002",
    weeklySchedule: {
      Monday: {
        start: "09:00",
        end: "17:00",
        slots: [
          "08:30",
          "09:30",
          "10:30",
          "11:30",
          "12:30",
          "13:30",
          "14:30",
          "15:30",
          "16:30",
        ],
      },
      Tuesday: {
        start: "09:00",
        end: "17:00",
        slots: [
          "08:30",
          "09:30",
          "10:30",
          "11:30",
          "12:30",
          "13:30",
          "14:30",
          "15:30",
          "16:30",
        ],
      },
      Wednesday: {
        start: "09:00",
        end: "17:00",
        slots: [
          "08:30",
          "09:30",
          "10:30",
          "11:30",
          "12:30",
          "13:30",
          "14:30",
          "15:30",
          "16:30",
        ],
      },
      Thursday: {
        start: "09:00",
        end: "17:00",
        slots: [
          "08:30",
          "09:30",
          "10:30",
          "11:30",
          "12:30",
          "13:30",
          "14:30",
          "15:30",
          "16:30",
        ],
      },
      Friday: {
        start: "09:00",
        end: "17:00",
        slots: [
          "08:30",
          "09:30",
          "10:30",
          "11:30",
          "12:30",
          "13:30",
          "14:30",
          "15:30",
          "16:30",
        ],
      },
    },
  },
  {
    id: "doc-3",
    name: "Dr. Sarah Jenkins",
    specialty: "Pediatrics",
    rating: 4.9,
    avatar:
      "https://images.unsplash.com/photo-1594824813573-246434de83fb?auto=format&fit=crop&q=80&w=300",
    biography:
      "Dr. Sarah Jenkins has loved working with children for over 15 years. Specializing in infant care and developmental screening, she offers compassionate guidance for growing families.",
    location: "789 Broadway St, New York, USA",
    phoneNumber: "+15550100003",
    weeklySchedule: {
      Monday: {
        start: "09:00",
        end: "17:00",
        slots: [
          "09:00",
          "10:00",
          "11:00",
          "12:00",
          "13:00",
          "14:00",
          "15:00",
          "16:00",
        ],
      },
      Wednesday: {
        start: "09:00",
        end: "17:00",
        slots: [
          "09:00",
          "10:00",
          "11:00",
          "12:00",
          "13:00",
          "14:00",
          "15:00",
          "16:00",
        ],
      },
      Friday: {
        start: "09:00",
        end: "17:00",
        slots: [
          "09:00",
          "10:00",
          "11:00",
          "12:00",
          "13:00",
          "14:00",
          "15:00",
          "16:00",
        ],
      },
    },
  },
  {
    id: "doc-4",
    name: "Dr. Alan Turing",
    specialty: "Psychology",
    rating: 4.8,
    avatar:
      "https://images.unsplash.com/photo-1537368910025-700350fe46c7?auto=format&fit=crop&q=80&w=300",
    biography:
      "Dr. Alan Turing is a clinical psychologist specializing in cognitive behavioral therapy, anxiety management, and work-related stress counseling.",
    location: "101 Bleeker St, New York, USA",
    phoneNumber: "+15550100004",
    weeklySchedule: {
      Tuesday: {
        start: "10:00",
        end: "18:00",
        slots: [
          "10:00",
          "11:00",
          "12:00",
          "13:00",
          "14:00",
          "15:00",
          "16:00",
          "17:00",
        ],
      },
      Thursday: {
        start: "10:00",
        end: "18:00",
        slots: [
          "10:00",
          "11:00",
          "12:00",
          "13:00",
          "14:00",
          "15:00",
          "16:00",
          "17:00",
        ],
      },
    },
  },
];

export const AppointmentProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const datesList = generateDatesList();

  const [role, setRole] = useState<RoleType>("client");
  const [selectedCategory, setSelectedCategory] =
    useState<string>("Cardiology");
  const [doctors, setDoctors] = useState<Doctor[]>(INITIAL_DOCTORS);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(
    INITIAL_DOCTORS[0].id,
  );
  const selectedDoctor =
    doctors.find((d) => d.id === selectedDoctorId) ?? doctors[0];
  const setSelectedDoctor = (d: Doctor) => setSelectedDoctorId(d.id);
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(
    datesList[0].dateString,
  );
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Base list of pre-filled appointments
  const [appointments, setAppointments] = useState<Appointment[]>([
    {
      id: "apt-1",
      patientName: "Ibrahim Kadri",
      patientAge: 54,
      patientGender: "Male",
      doctorName: "Dr. Liza Martin",
      category: "Cardiology",
      date: datesList[0].dateString,
      time: "08:30",
      type: "online",
      status: "accepted",
      reason:
        "Individual Counselling for feeling stress all the time after office.",
      createdAt: new Date().toISOString(),
    },
    {
      id: "apt-2",
      patientName: "Umair Ibn Jawaal",
      patientAge: 74,
      patientGender: "Male",
      doctorName: "Dr. Liza Martin",
      category: "Cardiology",
      date: datesList[0].dateString,
      time: "12:30",
      type: "offline",
      status: "accepted",
      reason: "Post-surgery heart checkup and recovery consultation.",
      createdAt: new Date().toISOString(),
    },
    {
      id: "apt-3",
      patientName: "Mus'ab ibn Umayr",
      patientAge: 28,
      patientGender: "Male",
      doctorName: "Dr. Liza Martin",
      category: "Cardiology",
      date: datesList[0].dateString,
      time: "16:30",
      type: "offline",
      status: "accepted",
      reason: "General consultation for irregular heartbeat.",
      createdAt: new Date().toISOString(),
    },
    {
      id: "apt-4",
      patientName: "Uthman ibn Hunaif",
      patientAge: 45,
      patientGender: "Male",
      doctorName: "Dr. Liza Martin",
      category: "Cardiology",
      date: datesList[0].dateString,
      time: "09:30",
      type: "online",
      status: "pending",
      reason: "Follow-up discussion about hypertension medication.",
      createdAt: new Date().toISOString(),
    },
    {
      id: "apt-5",
      patientName: "Sa'd ibn Mu'adh",
      patientAge: 40,
      patientGender: "Male",
      doctorName: "Dr. Liza Martin",
      category: "Cardiology",
      date: datesList[1].dateString,
      time: "10:30",
      type: "offline",
      status: "pending",
      reason: "Mild chest tightness monitoring.",
      createdAt: new Date().toISOString(),
    },
  ]);

  const addToast = useCallback(
    (message: string, type: ToastMessage["type"]) => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { id, message, type }]);
    },
    [],
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const bookAppointment = (
    details: Omit<Appointment, "id" | "status" | "createdAt">,
  ) => {
    // Check if slot is already booked
    const isBlocked = blockedSlots.some(
      (b) =>
        b.doctorName === details.doctorName &&
        b.date === details.date &&
        b.time === details.time,
    );
    const isTaken =
      isBlocked ||
      appointments.some(
        (apt) =>
          apt.doctorName === details.doctorName &&
          apt.date === details.date &&
          apt.time === details.time &&
          apt.status !== "canceled" &&
          apt.status !== "rejected",
      );

    if (isTaken) {
      addToast(
        `Sorry, the slot at ${details.time} is already booked!`,
        "warning",
      );
      return;
    }

    const newApt: Appointment = {
      ...details,
      id: `apt-${Math.random().toString(36).substring(2, 9)}`,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    setAppointments((prev) => [newApt, ...prev]);
    addToast(
      `Successfully requested appointment for ${details.patientName}!`,
      "success",
    );
  };

  const updateAppointmentStatus = (id: string, status: AppointmentStatus) => {
    setAppointments((prev) =>
      prev.map((apt) => (apt.id === id ? { ...apt, status } : apt)),
    );

    const apt = appointments.find((a) => a.id === id);
    if (apt) {
      addToast(
        `Appointment for ${apt.patientName} has been ${status}.`,
        status === "accepted"
          ? "success"
          : status === "canceled" || status === "rejected"
            ? "warning"
            : "info",
      );
    }
  };

  const toggleBlockedSlot = (
    doctorName: string,
    date: string,
    time: string,
  ) => {
    setBlockedSlots((prev) =>
      prev.some(
        (b) =>
          b.doctorName === doctorName && b.date === date && b.time === time,
      )
        ? prev.filter(
            (b) =>
              !(
                b.doctorName === doctorName &&
                b.date === date &&
                b.time === time
              ),
          )
        : [...prev, { doctorName, date, time }],
    );
  };

  const setDaySlots = (doctorId: string, dayName: string, slots: string[]) => {
    setDoctors((prev) =>
      prev.map((d) =>
        d.id === doctorId
          ? {
              ...d,
              weeklySchedule: {
                ...d.weeklySchedule,
                [dayName]: {
                  start: d.weeklySchedule[dayName]?.start ?? "09:00",
                  end: d.weeklySchedule[dayName]?.end ?? "17:00",
                  slots,
                },
              },
            }
          : d,
      ),
    );
  };

  const addAppointment = (apt: Appointment) => {
    setAppointments((prev) => [apt, ...prev]);
  };

  // Switch doctor selection automatically when category changes
  useEffect(() => {
    const matchedDoc = INITIAL_DOCTORS.find(
      (d) => d.specialty === selectedCategory,
    );
    if (matchedDoc) {
      setSelectedDoctorId(matchedDoc.id);
    }
  }, [selectedCategory]);

  // Real-time Booking Simulator
  useEffect(() => {
    const interval = setInterval(() => {
      // 30% chance to simulate a background booking
      if (Math.random() > 0.4) {
        // Pick a random doctor, date, and available slot
        const randomDoc = doctors[Math.floor(Math.random() * doctors.length)];
        const randomDateObj =
          datesList[Math.floor(Math.random() * datesList.length)];
        const dateStr = randomDateObj.dateString;

        // Find weekday name
        const days = [
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
        ];
        const dObj = new Date(dateStr);
        const dayName = days[dObj.getDay()];

        const schedule = randomDoc.weeklySchedule[dayName];
        if (!schedule) return;

        const slots = schedule.slots;

        // Find which slots are already booked for this doctor & date
        const bookedTimes = appointments
          .filter(
            (a) =>
              a.doctorName === randomDoc.name &&
              a.date === dateStr &&
              a.status !== "canceled" &&
              a.status !== "rejected",
          )
          .map((a) => a.time);

        const availableSlots = slots.filter(
          (s) =>
            !bookedTimes.includes(s) &&
            !blockedSlots.some(
              (b) =>
                b.doctorName === randomDoc.name &&
                b.date === dateStr &&
                b.time === s,
            ),
        );

        if (availableSlots.length > 0) {
          const randomSlot =
            availableSlots[Math.floor(Math.random() * availableSlots.length)];

          const names = [
            "Sarah Connor",
            "John Doe",
            "Alice Smith",
            "Bob Jones",
            "Emma Watson",
            "David Miller",
            "Sophia Taylor",
          ];
          const reasons = [
            "General checkup",
            "Consultation",
            "Follow-up consultation",
            "Routine evaluation",
          ];
          const name = names[Math.floor(Math.random() * names.length)];
          const age = Math.floor(Math.random() * 50) + 18;
          const gender = Math.random() > 0.5 ? "Male" : "Female";

          const simulatedApt: Appointment = {
            id: `sim-${Math.random().toString(36).substring(2, 9)}`,
            patientName: name,
            patientAge: age,
            patientGender: gender,
            doctorName: randomDoc.name,
            category: randomDoc.specialty,
            date: dateStr,
            time: randomSlot,
            type: Math.random() > 0.5 ? "online" : "offline",
            status: "accepted",
            reason: reasons[Math.floor(Math.random() * reasons.length)],
            createdAt: new Date().toISOString(),
          };

          setAppointments((prev) => [simulatedApt, ...prev]);

          // Only show toast if active doctor or active date matches, to avoid spamming unrelated bookings
          if (
            randomDoc.name === selectedDoctor.name &&
            dateStr === selectedDate
          ) {
            addToast(
              `[Real-time Alert] The ${randomSlot} slot was just booked by ${name}.`,
              "info",
            );
          } else {
            addToast(
              `[Real-time Alert] New booking for ${randomDoc.name} on ${randomDateObj.monthName} ${randomDateObj.dayNum}.`,
              "info",
            );
          }
        }
      }
    }, 20000); // Trigger every 20 seconds

    return () => clearInterval(interval);
  }, [
    appointments,
    doctors,
    blockedSlots,
    selectedDoctor,
    selectedDate,
    datesList,
    addToast,
  ]);

  return (
    <AppointmentContext.Provider
      value={{
        role,
        setRole,
        doctors,
        selectedDoctor,
        setSelectedDoctor,
        selectedCategory,
        setSelectedCategory,
        selectedDate,
        setSelectedDate,
        appointments,
        bookAppointment,
        updateAppointmentStatus,
        blockedSlots,
        toggleBlockedSlot,
        setDaySlots,
        addAppointment,
        toasts,
        addToast,
        removeToast,
        datesList,
      }}
    >
      {children}
    </AppointmentContext.Provider>
  );
};

export const useAppointments = () => {
  const context = useContext(AppointmentContext);
  if (!context) {
    throw new Error(
      "useAppointments must be used within an AppointmentProvider",
    );
  }
  return context;
};
