import { useState } from 'react';
import type { ScheduleEvent } from '../model/types';
import { isValidEventTime, sunTimes } from '../model/sun';
import { useAppStore } from '../store/store';
import { NumberField } from './controls/NumberField';
import { IconButton, IconCross, IconPlus, SelectField, Toggle } from './controls/common';

function fmtTime(d: Date | null): string {
  if (!d) return '--:--';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** The installation clock: solar-relative or fixed-time cues, computed
 * entirely offline from lat/lon. */
export function SchedulePanel(): React.ReactElement {
  const schedule = useAppStore((s) => s.project.schedule);
  const scenes = useAppStore((s) => s.project.scenes);
  const setScheduleEnabled = useAppStore((s) => s.setScheduleEnabled);
  const setScheduleLocation = useAppStore((s) => s.setScheduleLocation);
  const addScheduleEvent = useAppStore((s) => s.addScheduleEvent);
  const updateScheduleEvent = useAppStore((s) => s.updateScheduleEvent);
  const deleteScheduleEvent = useAppStore((s) => s.deleteScheduleEvent);

  const today = sunTimes(new Date(), schedule.location.lat, schedule.location.lon);

  return (
    <section className="panel panel-schedule">
      <h2 className="section-title">Schedule</h2>
      <div className="numfield">
        <span className="nf-label">Enabled</span>
        <Toggle checked={schedule.enabled} onChange={setScheduleEnabled} />
      </div>
      <NumberField
        label="Latitude"
        value={schedule.location.lat}
        min={-90}
        max={90}
        step={0.02}
        keyStep={0.1}
        decimals={2}
        onChange={(v) => setScheduleLocation(v, schedule.location.lon)}
      />
      <NumberField
        label="Longitude"
        value={schedule.location.lon}
        min={-180}
        max={180}
        step={0.02}
        keyStep={0.1}
        decimals={2}
        onChange={(v) => setScheduleLocation(schedule.location.lat, v)}
      />
      <div className="meta-row">
        <span className="meta-label">Today</span>
        <span className="mono sun-readout">
          {fmtTime(today.sunrise)} / {fmtTime(today.sunset)}
        </span>
      </div>
      {schedule.events.map((event, i) => (
        <EventRow
          key={i}
          event={event}
          index={i}
          sceneOptions={scenes.map((s) => ({ value: s.id, label: s.name }))}
          onChange={(patch) => updateScheduleEvent(i, patch)}
          onDelete={() => deleteScheduleEvent(i)}
        />
      ))}
      <button type="button" className="btn add-btn" onClick={addScheduleEvent}>
        <IconPlus /> Add event
      </button>
      <div className="panel-hint">
        Times: 23:30, sunset-00:30, sunrise+01:00. Each fires once per day.
      </div>
    </section>
  );
}

function EventRow(props: {
  event: ScheduleEvent;
  index: number;
  sceneOptions: { value: string; label: string }[];
  onChange: (patch: Partial<ScheduleEvent>) => void;
  onDelete: () => void;
}): React.ReactElement {
  const { event } = props;
  const [atDraft, setAtDraft] = useState<string | null>(null);
  const atInvalid = atDraft != null && atDraft !== '' && !isValidEventTime(atDraft);

  return (
    <div className="event-row">
      <div className="event-row-line">
        <input
          className={atInvalid ? 'text-input mono at-input invalid' : 'text-input mono at-input'}
          value={atDraft ?? event.at}
          aria-label="Event time"
          onChange={(e) => setAtDraft(e.target.value)}
          onBlur={() => {
            if (atDraft != null && isValidEventTime(atDraft)) props.onChange({ at: atDraft });
            setAtDraft(null);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') setAtDraft(null);
          }}
        />
        <IconButton title="Delete event" danger onClick={props.onDelete}>
          <IconCross />
        </IconButton>
      </div>
      <SelectField
        label="Action"
        value={event.action}
        options={[
          { value: 'fadeToScene', label: 'Fade to scene' },
          { value: 'fadeToBlack', label: 'Fade to black' },
        ]}
        onChange={(v) => props.onChange({ action: v })}
      />
      {event.action === 'fadeToScene' && props.sceneOptions.length > 0 && (
        <SelectField
          label="Scene"
          value={event.sceneId ?? props.sceneOptions[0].value}
          options={props.sceneOptions}
          onChange={(v) => props.onChange({ sceneId: v })}
        />
      )}
      <NumberField
        label="Fade"
        value={event.durationSec}
        min={0}
        max={3600}
        step={1}
        keyStep={5}
        decimals={0}
        suffix=" s"
        onChange={(v) => props.onChange({ durationSec: v })}
      />
    </div>
  );
}
