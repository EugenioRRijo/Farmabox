import { MESSAGES } from '@/constants';

export function StatusCard() {
  return (
    <>
      <div className="border-l-4 border-green-500 pl-4">
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">
          {MESSAGES.STATUS.INITIALIZED}
        </h2>
        <ul className="text-gray-700 space-y-2">
          <li>{MESSAGES.STATUS.ENCRYPTION_ACTIVE}</li>
          <li>{MESSAGES.STATUS.ZERO_TOLERANCE}</li>
          <li>{MESSAGES.STATUS.LOGGING_OK}</li>
          <li>{MESSAGES.STATUS.OFFLINE_ENABLED}</li>
        </ul>
      </div>

      <div className="mt-6 p-4 bg-blue-50 rounded border border-blue-200">
        <p className="text-sm text-blue-800">
          <strong>Nota</strong>: {MESSAGES.NOTES.SKELETON}
        </p>
      </div>
    </>
  );
}
