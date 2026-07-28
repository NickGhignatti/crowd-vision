set shell := ["bash", "-c"]
set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]

mod setup 'just/setup.just'
mod stack 'just/stack.just'
mod test 'just/test.just'
mod db 'just/db.just'
mod agent 'just/agent.just'
mod docs 'just/docs.just'
mod lint 'just/lint.just'
mod k8s 'just/k8s.just'

default:
    @just --list
