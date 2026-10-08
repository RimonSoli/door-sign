package com.doorsign.app;

import android.content.SharedPreferences;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.List;

/**
 * The tablet's screen schedule: an on time, an off time (same every day),
 * and an option to stay off all weekend. Times are minutes after midnight.
 * If the off time is earlier than the on time, the on period runs past
 * midnight. Equal times mean "on all day".
 */
final class Schedule {

    static final String KEY_ENABLED = "sched_enabled";
    static final String KEY_ON = "sched_on_min";
    static final String KEY_OFF = "sched_off_min";
    static final String KEY_WEEKEND_OFF = "sched_weekend_off";

    final boolean enabled;
    final int onMin;
    final int offMin;
    final boolean weekendOff;

    Schedule(boolean enabled, int onMin, int offMin, boolean weekendOff) {
        this.enabled = enabled;
        this.onMin = onMin;
        this.offMin = offMin;
        this.weekendOff = weekendOff;
    }

    static Schedule load(SharedPreferences p) {
        return new Schedule(
                p.getBoolean(KEY_ENABLED, false),
                p.getInt(KEY_ON, 8 * 60),
                p.getInt(KEY_OFF, 18 * 60),
                p.getBoolean(KEY_WEEKEND_OFF, true));
    }

    void save(SharedPreferences p) {
        p.edit()
                .putBoolean(KEY_ENABLED, enabled)
                .putInt(KEY_ON, onMin)
                .putInt(KEY_OFF, offMin)
                .putBoolean(KEY_WEEKEND_OFF, weekendOff)
                .apply();
    }

    /** Should the screen be on at this moment? */
    boolean isOnAt(long timeMs) {
        if (!enabled) return true;
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(timeMs);
        int dow = c.get(Calendar.DAY_OF_WEEK);
        if (weekendOff && (dow == Calendar.SATURDAY || dow == Calendar.SUNDAY)) return false;
        if (onMin == offMin) return true;
        int m = c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE);
        if (onMin < offMin) return m >= onMin && m < offMin;
        return m >= onMin || m < offMin;
    }

    /** The next moment (within 8 days) when on/off changes, or -1 if it never does. */
    long nextChange(long nowMs) {
        if (!enabled) return -1;
        boolean current = isOnAt(nowMs);
        List<Long> candidates = new ArrayList<>();
        for (int day = 0; day <= 8; day++) {
            for (int minutes : new int[]{onMin, offMin, 0}) {
                Calendar c = Calendar.getInstance();
                c.setTimeInMillis(nowMs);
                c.add(Calendar.DAY_OF_YEAR, day);
                c.set(Calendar.HOUR_OF_DAY, minutes / 60);
                c.set(Calendar.MINUTE, minutes % 60);
                c.set(Calendar.SECOND, 0);
                c.set(Calendar.MILLISECOND, 0);
                if (c.getTimeInMillis() > nowMs) candidates.add(c.getTimeInMillis());
            }
        }
        Collections.sort(candidates);
        for (long t : candidates) {
            if (isOnAt(t) != current) return t;
        }
        return -1;
    }
}
