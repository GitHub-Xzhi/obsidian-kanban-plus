export const defaultArchiveDateSeparator = '🗄️';

export interface ArchiveDateSettings {
  archiveDate: string;
  archiveDateSeparator?: string;
  archiveDateAfterTitle?: boolean;
}

export function getArchiveDateText({
  archiveDate,
  archiveDateSeparator,
  archiveDateAfterTitle,
}: ArchiveDateSettings) {
  if (!archiveDateSeparator) {
    return archiveDate;
  }

  return archiveDateAfterTitle
    ? `${archiveDateSeparator} ${archiveDate}`
    : `${archiveDate} ${archiveDateSeparator}`;
}