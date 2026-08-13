export default class E2eResultReporter {
  onEnd(result) {
    process.stdout.write(`\n__VENUE_E2E_RESULT__=${result.status}\n`);
  }
}
