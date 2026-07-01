/** Tracks interview MediaStreams so Feedback can release camera/mic on mount. */
const trackedStreams = new Set()

export function trackInterviewStream(stream) {
  if (stream) trackedStreams.add(stream)
}

export function untrackInterviewStream(stream) {
  if (stream) trackedStreams.delete(stream)
}

export function releaseAllInterviewMedia() {
  trackedStreams.forEach((stream) => {
    stream.getTracks().forEach((track) => track.stop())
  })
  trackedStreams.clear()
}
