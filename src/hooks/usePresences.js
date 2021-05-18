import React from 'react';

import { useMutation, useQuery, useQueryClient } from 'react-query';
import { asDayRef, nrmlStr } from '../helpers';
import { fieldMap, placesId } from '../settings';

const { VITE_DATA_TOKEN } = import.meta.env;

const headers = {
  Authorization: `Token ${VITE_DATA_TOKEN}`,
  'Content-Type': 'application/json',
};

const usePresences = (place, dayRefFrom, dayRefTo) => {
  const queryClient = useQueryClient();
  const basePath = `https://api.baserow.io/api/database/rows/table/${placesId[place]}/`;

  const fields = fieldMap[place];
  const { KEY, DATE, DAYREF, MATIN, MIDI, APREM, TRI } = fields;

  const queryKey = ['presences', place, dayRefFrom, dayRefTo];
  const qs = [
    `?filter__${fields.DAYREF}__higher_than=${dayRefFrom - 1}`,
    `&filter__${fields.DAYREF}__lower_than=${dayRefTo + 1}`,
  ].join('');

  const { data: { results: presences = [] } = {} } = useQuery(
    queryKey,
    async () => {
      const response = await fetch(
        basePath + qs,
        { headers: { Authorization: `Token ${VITE_DATA_TOKEN}` } },
      );

      return response.json();
    },
    { staleTime: 60000, refetchInterval: 60000, retryDelay: 10000 },
  );

  const createRow = useMutation(record => fetch(
    basePath,
    { headers, method: 'POST', body: JSON.stringify(record) },
  ), {
    onMutate: async record => {
      queryClient.setQueryData(queryKey, previous => ({
        results: [
          ...previous.results,
          { ...record, fake: true, id: record[fieldMap[place].KEY] },
        ],
      }));
    },
    onSettled: () => queryClient.invalidateQueries(queryKey),
  });

  const updateRow = useMutation(record => fetch(
    `${basePath}${record.id}/`,
    { headers, method: 'PATCH', body: JSON.stringify(record) },
  ), {
    onMutate: async record => {
      queryClient.setQueryData(queryKey, ({ results = [] }) => ({
        results: results.map(result => (
          result.id === record.id
            ? { ...result, ...record, fake: true }
            : result
        )),
      }));
    },
    onSettled: () => queryClient.invalidateQueries(queryKey),
  });

  const deleteRow = useMutation(record => fetch(
    `${basePath}${record.id}/`,
    { headers, method: 'DELETE' },
  ), {
    onMutate: async record => {
      queryClient.setQueryData(queryKey, ({ results = [] }) => ({
        results: results.filter(result => (result.id !== record.id)),
      }));
    },
    onSettled: () => queryClient.invalidateQueries(queryKey),
  });

  const createPresence = React.useCallback(
    (date, tri, changes) => {
      const isoDate = date.format('YYYY-MM-DD');
      const cleanTri = tri.length <= 3 ? nrmlStr(tri) : tri.trim();

      return createRow.mutate({
        [KEY]: `${isoDate}-${cleanTri}`,
        [DATE]: isoDate,
        [DAYREF]: asDayRef(date),
        [TRI]: cleanTri,
        ...changes,
      });
    },
    [DATE, DAYREF, KEY, TRI, createRow],
  );

  const createDayPresence = React.useCallback(
    (date, tri) => createPresence(date, tri, { [MATIN]: true, [MIDI]: true, [APREM]: true }),
    [APREM, MATIN, MIDI, createPresence],
  );

  const deletePresence = React.useCallback(
    presence => deleteRow.mutate(presence),
    [deleteRow],
  );

  const fillPresence = React.useCallback(
    presence => updateRow.mutate({ ...presence, [MATIN]: true, [MIDI]: true, [APREM]: true }),
    [APREM, MATIN, MIDI, updateRow],
  );

  const editPresence = React.useCallback(
    (presence, changes) => updateRow.mutate({ ...presence, ...changes }),
    [updateRow],
  );

  const setPresence = React.useCallback(
    ({ date, tri, changes, currentPresences }) => {
      const userPresence = currentPresences.find(
        ({ [TRI]: t, [DATE]: d }) =>
          d === date.format('YYYY-MM-DD') && tri === t,
      );

      if (!changes) {
        if (userPresence) {
          if (!userPresence[MATIN] || !userPresence[MIDI] || !userPresence[APREM]) {
            return fillPresence(userPresence);
          }

          return deletePresence(userPresence);
        }

        return createDayPresence(date, tri);
      }

      if (userPresence) {
        const newPresence = { ...userPresence, ...changes };

        if (!newPresence[MATIN] && !newPresence[MIDI] && !newPresence[APREM]) {
          return deletePresence(newPresence);
        }

        return editPresence({ ...userPresence, ...changes });
      }

      return createPresence(date, tri, changes);
    },
    [
      APREM, DATE, MATIN, MIDI, TRI,
      createDayPresence, createPresence, deletePresence, editPresence, fillPresence,
    ],
  );

  return {
    presences,
    setPresence,
    createRow,
    updateRow,
    deleteRow,
  };
};

export default usePresences;
