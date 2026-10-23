import { tenantScopedQuery, tenantRecord } from '../firebaseUtils';
import { useAuth } from '../contexts/AuthContext';
import React, { useState, useEffect } from "react";
import {
  Clock,
  Calendar,
  MapPin,
  Plus,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Edit,
} from "lucide-react";
import { db } from "../firebase";
import {
  collection,
  addDoc,
  onSnapshot,
  deleteDoc,
  doc,
  updateDoc,
  where,
} from "firebase/firestore";

export function FacilityBookingLegacy() {
  const { user, role } = useAuth();
  const [bookings, setBookings] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const [formData, setFormData] = useState({
    room: "",
    date: "",
    startTime: "",
    endTime: "",
    purpose: "",
    booker: "",
  });

  const rooms = [
    "Aula Utama",
    "Ruang Rapat 1",
    "Ruang Rapat 2",
    "Laboratorium Komputer",
    "Perpustakaan",
    "Kelas 10A",
    "Kelas 10B",
    "Lapangan Basket",
  ];

  useEffect(() => {
    const canManageAllBookings = ['Admin', 'SuperAdmin'].includes(role) && (user?.modulePermissions?.ga !== false || user?.modulePermissions?.boarding !== false);
    const q = tenantScopedQuery(collection(db, "facility_bookings"), user?.tenantId, ...(canManageAllBookings ? [] : [where('createdByUid', '==', user?.uid || '__tenant_scope_unavailable__')]));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const bks = snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, any>) })).sort((left: any, right: any) => String(right.date || '').localeCompare(String(left.date || '')) || String(right.startTime || '').localeCompare(String(left.startTime || '')));
      setBookings(bks);
    });
    return () => unsubscribe();
  }, [user?.tenantId, user?.uid, role, user?.modulePermissions?.ga, user?.modulePermissions?.boarding]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await updateDoc(doc(db, "facility_bookings", editingId), formData);
        setNotification({
          message: "Booking updated successfully",
          type: "success",
        });
      } else {
        await addDoc(collection(db, "facility_bookings"), tenantRecord(user?.tenantId, {
          ...formData,
          status: "Confirmed",
          createdByUid: user?.uid,
        }));
        setNotification({
          message: "Room booked successfully",
          type: "success",
        });
      }
      setIsModalOpen(false);
      setTimeout(() => setNotification(null), 3000);
    } catch (err) {
      console.error(err);
      setNotification({ message: "Failed to save booking", type: "error" });
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const [bookingToCancel, setBookingToCancel] = useState<string | null>(null);

  const handleDelete = (id: string) => {
    setBookingToCancel(id);
  };

  const confirmCancelBooking = async () => {
    if (!bookingToCancel) return;
    try {
      await deleteDoc(doc(db, "facility_bookings", bookingToCancel));
      setNotification({
        message: "Pemesanan ruangan berhasil dibatalkan",
        type: "success",
      });
      setTimeout(() => setNotification(null), 3000);
    } catch (err) {
      setNotification({ message: "Gagal membatalkan pemesanan", type: "error" });
      setTimeout(() => setNotification(null), 3000);
    } finally {
      setBookingToCancel(null);
    }
  };

  const handleEdit = (booking: any) => {
    setFormData({
      room: booking.room,
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      purpose: booking.purpose,
      booker: booking.booker,
    });
    setEditingId(booking.id);
    setIsModalOpen(true);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-[#0a0a0a]/50">
      {notification && (
        <div
          className={`absolute top-4 right-4 z-50 p-4 rounded-lg flex items-center gap-2 border shadow-lg ${
            notification.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
              : "bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400"
          }`}
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          <p className="font-medium text-sm">{notification.message}</p>
        </div>
      )}

      <div className="p-6 border-b border-slate-200 dark:border-white/5 bg-white dark:bg-black/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">
            Facility & Room Booking
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage reservations for classrooms, meeting rooms, and other
            facilities.
          </p>
        </div>
        <button
          onClick={() => {
            setEditingId(null);
            setFormData({
              room: rooms[0],
              date: new Date().toISOString().split("T")[0],
              startTime: "08:00",
              endTime: "10:00",
              purpose: "",
              booker: "",
            });
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors font-medium text-sm shadow-sm"
        >
          <Plus className="w-4 h-4" /> New Booking
        </button>
      </div>

      <div className="flex-1 p-6 overflow-y-auto">
        {bookings.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm bg-white dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/5">
            No bookings found. Click "New Booking" to reserve a facility.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {bookings.map((booking) => (
              <div
                key={booking.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl p-5 shadow-sm hover:border-emerald-500/50 transition-colors group"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold">
                    <MapPin className="w-4 h-4" /> {booking.room}
                  </div>
                  <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded border bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                    {booking.status}
                  </span>
                </div>

                <div className="space-y-3 mb-4">
                  <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                    <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>{booking.date}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                    <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>
                      {booking.startTime} - {booking.endTime}
                    </span>
                  </div>
                </div>

                <div className="text-sm border-t border-slate-100 dark:border-white/5 pt-3">
                  <div className="font-medium text-slate-800 dark:text-slate-200 mb-1">
                    {booking.purpose}
                  </div>
                  <div className="text-xs text-slate-500">
                    Booked by:{" "}
                    <span className="font-medium">{booking.booker}</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/5 flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleEdit(booking)}
                    className="p-1.5 text-slate-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(booking.id)}
                    className="p-1.5 text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Booking Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-xl border border-slate-200 dark:border-white/10 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-200 dark:border-white/10 flex justify-between items-center bg-slate-50 dark:bg-black/20 rounded-t-2xl">
              <h3 className="font-semibold text-lg text-slate-800 dark:text-slate-200">
                {editingId ? "Edit Booking" : "New Facility Booking"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                <Plus className="w-5 h-5 rotate-45" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto">
              <form
                id="booking-form"
                onSubmit={handleSave}
                className="space-y-4"
              >
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    Facility / Room
                  </label>
                  <select
                    required
                    value={formData.room}
                    onChange={(e) =>
                      setFormData({ ...formData, room: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="" disabled>
                      Select a room
                    </option>
                    {rooms.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) =>
                      setFormData({ ...formData, date: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                      Start Time
                    </label>
                    <input
                      type="time"
                      required
                      value={formData.startTime}
                      onChange={(e) =>
                        setFormData({ ...formData, startTime: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                      End Time
                    </label>
                    <input
                      type="time"
                      required
                      value={formData.endTime}
                      onChange={(e) =>
                        setFormData({ ...formData, endTime: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    Purpose / Event Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Weekly Staff Meeting"
                    value={formData.purpose}
                    onChange={(e) =>
                      setFormData({ ...formData, purpose: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    Booker Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Nama Anda"
                    value={formData.booker}
                    onChange={(e) =>
                      setFormData({ ...formData, booker: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </form>
            </div>

            <div className="p-5 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/20 rounded-b-2xl flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="booking-form"
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm transition-colors"
              >
                Save Booking
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Cancel Booking Confirmation Modal */}
      {bookingToCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-rose-500/30 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-500/20 text-rose-400 rounded-xl">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Batalkan Pemesanan Ruangan?</h3>
                <p className="text-xs text-slate-400">Jadwal ruangan akan dihapus</p>
              </div>
            </div>
            <p className="text-sm text-slate-300">
              Apakah Anda yakin ingin membatalkan dan menghapus pemesanan fasilitas ruangan ini?
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setBookingToCancel(null)}
                className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors border border-slate-700"
              >
                Kembali
              </button>
              <button
                type="button"
                onClick={confirmCancelBooking}
                className="px-4 py-2 text-sm font-medium bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition-colors shadow-lg shadow-rose-900/30 flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Batalkan Pemesanan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
