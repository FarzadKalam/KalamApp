import { useEffect, useMemo, useState } from "react";
import { Alert, App, Button, Card, Empty, Spin, Tag } from "antd";
import { ClockCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import PersianDatePicker from "../PersianDatePicker";
import SmartFieldRenderer from "../SmartFieldRenderer";
import { FieldLocation, FieldNature, FieldType } from "../../types";
import { supabase } from "../../supabaseClient";
import { getHolidaySummaryForDate } from "../../utils/holidayCalendar";
import { toFaErrorMessage } from "../../utils/errorMessageFa";
import {
  buildReservationSlots,
  type ReservationAvailabilitySettings,
  type ReservationBusyRange,
} from "../../utils/reservationAvailability";
import { toPersianNumber } from "../../utils/persianNumberFormatter";

const RESOURCE_FIELD = {
  key: "resource_id",
  labels: { fa: "منبع قابل رزرو", en: "Reservation resource" },
  type: FieldType.RELATION,
  location: FieldLocation.HEADER,
  nature: FieldNature.STANDARD,
  relationConfig: {
    targetModule: "reservation_resources",
    targetField: "name",
  },
};

const todayInTehran = () =>
  new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Tehran",
  }).format(new Date());

const ReservationAvailabilityPanel = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [date, setDate] = useState(todayInTehran);
  const [resourceId, setResourceId] = useState<string>("");
  const [settings, setSettings] = useState<ReservationAvailabilitySettings>({});
  const [resource, setResource] = useState<any>(null);
  const [busyRanges, setBusyRanges] = useState<ReservationBusyRange[]>([]);
  const [officialHoliday, setOfficialHoliday] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void supabase
      .from("company_settings")
      .select("reservation_settings")
      .limit(1)
      .maybeSingle()
      .then(({ data }) =>
        setSettings(
          (data?.reservation_settings || {}) as ReservationAvailabilitySettings,
        ),
      );
  }, []);

  useEffect(() => {
    let active = true;
    void getHolidaySummaryForDate(date).then((summary) => {
      if (active) setOfficialHoliday(summary?.isOfficialHoliday === true);
    });
    return () => {
      active = false;
    };
  }, [date]);

  useEffect(() => {
    if (!resourceId || !date) {
      setResource(null);
      setBusyRanges([]);
      return;
    }
    let active = true;
    setLoading(true);
    const dayStart = new Date(`${date}T00:00:00+03:30`).toISOString();
    const dayEnd = new Date(`${date}T23:59:59.999+03:30`).toISOString();
    void Promise.all([
      supabase
        .from("reservation_resources")
        .select("id,name,capacity,preparation_minutes,cleanup_minutes")
        .eq("id", resourceId)
        .eq("status", "active")
        .maybeSingle(),
      supabase
        .from("reservations")
        .select("id,start_at,end_at,reservationItems,status")
        .lt("start_at", dayEnd)
        .gt("end_at", dayStart)
        .not("status", "in", "(draft,canceled)"),
    ])
      .then(([resourceResult, reservationResult]) => {
        if (resourceResult.error) throw resourceResult.error;
        if (reservationResult.error) throw reservationResult.error;
        if (!active) return;
        setResource(resourceResult.data || null);
        const ranges = (reservationResult.data || []).flatMap(
          (reservation: any) => {
            const quantity = (
              Array.isArray(reservation.reservationItems)
                ? reservation.reservationItems
                : []
            )
              .filter(
                (item: any) => String(item?.resource_id || "") === resourceId,
              )
              .reduce(
                (sum: number, item: any) =>
                  sum + Math.max(0, Number(item?.quantity || 1)),
                0,
              );
            return quantity > 0
              ? [
                  {
                    startAt: reservation.start_at,
                    endAt: reservation.end_at,
                    quantity,
                  },
                ]
              : [];
          },
        );
        setBusyRanges(ranges);
      })
      .catch((error) => {
        if (active)
          message.error(
            toFaErrorMessage(error, "دریافت نوبت‌های آزاد ناموفق بود."),
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [date, message, resourceId]);

  const slots = useMemo(
    () =>
      resource
        ? buildReservationSlots({
            date,
            settings,
            capacity: Number(resource.capacity || 1),
            preparationMinutes: Number(resource.preparation_minutes || 0),
            cleanupMinutes: Number(resource.cleanup_minutes || 0),
            busyRanges,
          })
        : [],
    [busyRanges, date, resource, settings],
  );

  const holidayBlocked =
    officialHoliday && settings.allow_official_holidays !== true;

  return (
    <Card className="mb-3 shrink-0" styles={{ body: { padding: 14 } }}>
      <div className="grid items-end gap-3 md:grid-cols-[220px_minmax(260px,1fr)_auto]">
        <div>
          <div className="mb-1 text-xs font-bold text-gray-600 dark:text-gray-300">
            تاریخ مشاهده نوبت‌ها
          </div>
          <PersianDatePicker
            type="DATE"
            value={date}
            onChange={(value) => setDate(value || todayInTehran())}
          />
        </div>
        <SmartFieldRenderer
          field={RESOURCE_FIELD as any}
          value={resourceId || null}
          onChange={(value) => setResourceId(String(value || ""))}
          allValues={{ resource_id: resourceId }}
          moduleId="reservations"
          standalone
          forceEditMode
        />
        <Button
          icon={<PlusOutlined />}
          onClick={() => navigate("/reservation_resources/create")}
        >
          منبع تازه
        </Button>
      </div>

      {holidayBlocked ? (
        <Alert
          className="mt-3"
          type="warning"
          showIcon
          message="این تاریخ تعطیل رسمی است و رزرو در تعطیلات برای سازمان غیرفعال شده است."
        />
      ) : resourceId ? (
        <div className="mt-3">
          {loading ? (
            <div className="py-4 text-center">
              <Spin size="small" />
            </div>
          ) : slots.length ? (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {slots.map((slot) => (
                <Button
                  key={slot.startAt}
                  disabled={slot.remainingCapacity <= 0}
                  className="!h-auto min-w-[128px] shrink-0 !rounded-xl !px-3 !py-2"
                  onClick={() =>
                    navigate("/reservations/create", {
                      state: {
                        initialValues: {
                          start_at: slot.startAt,
                          end_at: slot.endAt,
                          reservationItems: [
                            { resource_id: resourceId, quantity: 1 },
                          ],
                        },
                      },
                    })
                  }
                >
                  <span className="flex flex-col items-start gap-1">
                    <span className="font-bold">
                      <ClockCircleOutlined className="ml-1" />
                      {toPersianNumber(slot.startLabel)} تا{" "}
                      {toPersianNumber(slot.endLabel)}
                    </span>
                    <Tag
                      color={slot.remainingCapacity > 0 ? "green" : "default"}
                      className="!m-0"
                    >
                      {slot.remainingCapacity > 0
                        ? `${toPersianNumber(slot.remainingCapacity)} ظرفیت آزاد`
                        : "تکمیل"}
                    </Tag>
                  </span>
                </Button>
              ))}
            </div>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="برای این روز شیفت فعالی تعریف نشده است."
            />
          )}
        </div>
      ) : (
        <div className="mt-3 text-xs text-gray-500">
          برای دیدن نوبت‌های آزاد، یک منبع را انتخاب کنید.
        </div>
      )}
    </Card>
  );
};

export default ReservationAvailabilityPanel;
