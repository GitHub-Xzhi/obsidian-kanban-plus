import { moment } from 'obsidian';

export interface ArchiveDateSettings {
  archiveDateFormat: string;
  archiveDateSeparator?: string;
  archiveDateAfterTitle?: boolean;
}

export function getArchiveDateText({
  archiveDateFormat,
  archiveDateSeparator,
  archiveDateAfterTitle,
  archivedAt,
}: ArchiveDateSettings & { archivedAt: number }) {
  const archiveDate = moment(archivedAt).format(archiveDateFormat);

  if (!archiveDateSeparator) {
    return archiveDate;
  }

  return archiveDateAfterTitle
    ? `${archiveDateSeparator} ${archiveDate}`
    : `${archiveDate} ${archiveDateSeparator}`;
}